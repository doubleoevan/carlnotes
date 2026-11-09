// the batched reads behind a topic feed: the findings, sources, attachments, last scans, month costs, owners, and
// teams of every topic in one feed, each read once for the whole batch
import { toAvatarKeyVersion } from "@carlnotes/contracts/avatars"
import { db, isFindingShown } from "@carlnotes/db"
import { bookmarks, consumptions, findings, resources, scans } from "@carlnotes/db/schema/scans"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { teamTopics } from "@carlnotes/db/schema/teamTopics"
import { attachments, sources, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm"
import { memberTopicIds, subscribedTopicIds } from "../authorization"
import { loadTopicChatMentions } from "../chat/mentions"
import { loadLatestPodcastEpisodes } from "../podcast/podcastEpisodeShapes"
import {
	TOPIC_FINDING_COLUMNS,
	type TopicFindingRow,
	toBookmarkJoinCondition,
	toConsumptionJoinCondition,
	USER_FINDING_COLUMNS,
} from "./findings"
import { startOfUtcMonth } from "./quotas"

// the most findings the feed query pulls per topic
// ponytail: a user who consumed a topic's top 25 findings sees an empty card in the default view, raise this if that shows up
const MAX_FEED_FINDINGS_PER_TOPIC = 25

/**
 * Reads every dataset the topic feeds need across all topic ids at once, each grouped by topic id.
 */
export async function loadTopicFeedData(topicRows: (typeof topics.$inferSelect)[], userId: string | null) {
	const topicIds = topicRows.map((topicRow) => topicRow.id)

	// run the topic-batched queries together, plus the subscription and membership queries for the signed-in user
	// biome-ignore format: one line keeps the destructure under the comment-density hook's limit
	const [findingRows, sourceRows, attachmentRows, scanRows, monthCostRows, subscribedTopicIdSet, memberTopicIdSet, topicBylines, mentionsByTopic, teamCountRows, latestPodcastEpisodeByTopic] =
		await Promise.all([
			// each topic's best findings, with the user's consumed and bookmarked dates
			loadFeedFindingRows(topicIds, userId),
			// every topic's sources and attachments
			loadFeedSourceRows(topicIds),
			loadFeedAttachmentRows(topicIds),
			// each topic's latest succeeded scan, and this month's scan spend, which only the owner sees
			loadLastSucceededScanRows(topicIds),
			loadMonthCostRows(topicIds),
			// the topics this signed-in user is subscribed to, in one query. a signed-out visitor is subscribed to none
			userId ? subscribedTopicIds(userId, topicIds) : Promise.resolve(new Set<string>()),
			userId ? memberTopicIds(userId, topicIds) : Promise.resolve(new Set<string>()),
			// each topic's owner, and its owning team as the user may see it
			loadTopicBylines(topicIds, userId),
			// the user's unseen chat room mentions, for the count badge on each topic's name
			loadTopicChatMentions(userId, topicIds),
			// how many teams hold each topic, which the topic roast shows under the follower count
			loadSharedTeamCountRows(topicIds),
			// each topic's latest podcast episode that the user may listen to, which plays from the topic's card
			loadLatestPodcastEpisodes(topicRows, userId),
		])

	// group each dataset by topic id so that a feed can read its slice in memory
	return {
		findingRowsByTopic: Map.groupBy(findingRows, (row) => row.topicId),
		sourcesByTopic: Map.groupBy(sourceRows, (row) => row.topicId),
		attachmentsByTopic: Map.groupBy(attachmentRows, (row) => row.topicId),
		lastScanByTopic: new Map(scanRows.map((scanRow) => [scanRow.topicId, scanRow])),
		monthCostByTopic: new Map(monthCostRows.map((costRow) => [costRow.topicId, costRow.monthCost])),
		subscribedTopicIdSet,
		memberTopicIdSet,
		...topicBylines,
		mentionsByTopic,
		latestPodcastEpisodeByTopic,
		// the shared-in teams alone. the owning team has no row here, so each count adds it back
		sharedTeamCountByTopic: new Map(
			teamCountRows.map((teamCountRow) => [teamCountRow.topicId, teamCountRow.teamCount]),
		),
	}
}

// each topic's byline parts by topic id: its owner, and its owning team as the user may see it
export type TopicBylines = {
	ownerByTopic: Map<string, FeedOwnerRow>
	teamLinkByTopic: Map<string, { teamId: string; name: string; avatarVersion: string | null }>
}

/**
 * Reads every topic's owner and owning team at once, each by topic id. A private team's link goes to its own members
 * alone.
 */
export async function loadTopicBylines(topicIds: string[], userId: string | null): Promise<TopicBylines> {
	const [ownerRows, teamRows] = await Promise.all([loadFeedOwnerRows(topicIds), loadFeedTeamRows(topicIds, userId)])
	return {
		ownerByTopic: new Map(ownerRows.map((ownerRow) => [ownerRow.topicId, ownerRow])),
		teamLinkByTopic: toTeamLinkByTopic(teamRows),
	}
}

// each topic's team link by topic id: its owning team, which a private team shows only to its own members
function toTeamLinkByTopic(teamRows: FeedTeamRow[]): TopicBylines["teamLinkByTopic"] {
	return new Map(
		teamRows
			.filter((teamRow) => teamRow.isPublic || teamRow.memberUserId !== null)
			.map((teamRow) => [
				teamRow.topicId,
				{ teamId: teamRow.teamId, name: teamRow.name, avatarVersion: toAvatarKeyVersion(teamRow.avatarKey) },
			]),
	)
}

// each topic's findings joined with their resources, at most MAX_FEED_FINDINGS_PER_TOPIC per topic by relevance
async function loadFeedFindingRows(
	topicIds: string[],
	userId: string | null,
): Promise<(TopicFindingRow & { topicId: string; newestFindingCreatedAt: Date })[]> {
	// a signed-out visitor has no history, so each join condition is sql`false`.
	// drizzle's typing rejects comparing user_id to null
	const consumptionJoinCondition = userId ? toConsumptionJoinCondition(userId) : sql`false`
	const bookmarkJoinCondition = userId ? toBookmarkJoinCondition(userId) : sql`false`
	// rank each topic's findings by relevance so the feed query can stop at MAX_FEED_FINDINGS_PER_TOPIC per topic, and
	// read each topic's newest shown finding time in the same pass
	const rankedFindings = db
		.select({
			findingId: findings.id,
			rowNumber:
				sql<number>`row_number() over (partition by ${findings.topicId} order by ${findings.relevanceScore} desc, ${findings.id})`.as(
					"row_number",
				),
			newestFindingCreatedAt: sql<Date>`max(${findings.createdAt}) over (partition by ${findings.topicId})`
				.mapWith(findings.createdAt)
				.as("newest_finding_created_at"),
		})
		.from(findings)
		.where(and(inArray(findings.topicId, topicIds), isFindingShown))
		.as("ranked_findings")

	// join each topic finding with its resource. a left join adds the user's consumed date if one exists
	return (
		db
			.select({
				// the owning topic's id groups the rows, and every row includes its topic's newest shown finding time
				topicId: findings.topicId,
				newestFindingCreatedAt: rankedFindings.newestFindingCreatedAt,
				// the topic finding, and the user's consumed and bookmarked dates
				...TOPIC_FINDING_COLUMNS,
				...USER_FINDING_COLUMNS,
			})
			// join the resource and the user's consumed and bookmark rows
			.from(findings)
			.innerJoin(resources, eq(findings.resourceId, resources.id))
			.leftJoin(consumptions, consumptionJoinCondition)
			.leftJoin(bookmarks, bookmarkJoinCondition)
			.innerJoin(
				rankedFindings,
				and(eq(rankedFindings.findingId, findings.id), lte(rankedFindings.rowNumber, MAX_FEED_FINDINGS_PER_TOPIC)),
			)
			.where(and(inArray(findings.topicId, topicIds), isFindingShown))
			.orderBy(desc(findings.relevanceScore))
	)
}

// every topic's sources, with the screening status the owner sees
async function loadFeedSourceRows(
	topicIds: string[],
): Promise<Pick<typeof sources.$inferSelect, "topicId" | "id" | "kind" | "config" | "status" | "error">[]> {
	return db
		.select({
			topicId: sources.topicId,
			id: sources.id,
			kind: sources.kind,
			config: sources.config,
			status: sources.status,
			error: sources.error,
		})
		.from(sources)
		.where(inArray(sources.topicId, topicIds))
}

// every topic's attachments, with the topic id to group by
async function loadFeedAttachmentRows(
	topicIds: string[],
): Promise<Pick<typeof attachments.$inferSelect, "topicId" | "id" | "filename" | "sourceUrl" | "status">[]> {
	return db
		.select({
			topicId: attachments.topicId,
			id: attachments.id,
			filename: attachments.filename,
			sourceUrl: attachments.sourceUrl,
			status: attachments.status,
		})
		.from(attachments)
		.where(inArray(attachments.topicId, topicIds))
}

// the most recent succeeded scan per topic. the distinct-on keeps the summary from that same latest row
async function loadLastSucceededScanRows(
	topicIds: string[],
): Promise<Pick<typeof scans.$inferSelect, "topicId" | "startedAt" | "finishedAt" | "scanSummary" | "cost">[]> {
	return (
		db
			.selectDistinctOn([scans.topicId], {
				topicId: scans.topicId,
				startedAt: scans.startedAt,
				finishedAt: scans.finishedAt,
				scanSummary: scans.scanSummary,
				cost: scans.cost,
			})
			// sort so that the latest succeeded scan is the distinct row kept per topic
			.from(scans)
			.where(and(inArray(scans.topicId, topicIds), eq(scans.status, "succeeded")))
			.orderBy(scans.topicId, desc(scans.startedAt))
	)
}

// this month's scan spend per topic
async function loadMonthCostRows(
	topicIds: string[],
): Promise<(Pick<typeof scans.$inferSelect, "topicId"> & { monthCost: string })[]> {
	return db
		.select({ topicId: scans.topicId, monthCost: sql<string>`coalesce(sum(${scans.cost}), 0)` })
		.from(scans)
		.where(and(inArray(scans.topicId, topicIds), gte(scans.startedAt, startOfUtcMonth(new Date()))))
		.groupBy(scans.topicId)
}

// a topic's owner: the topic's id, the user's id, and what the avatar draws from
type FeedOwnerRow = { topicId: string; userId: string } & Pick<
	typeof users.$inferSelect,
	"username" | "avatarSource" | "avatarKey"
>

// each topic's owner, in one query across every topic
async function loadFeedOwnerRows(topicIds: string[]): Promise<FeedOwnerRow[]> {
	return db
		.select({
			topicId: topics.id,
			userId: users.id,
			username: users.username,
			avatarSource: users.avatarSource,
			avatarKey: users.avatarKey,
		})
		.from(topics)
		.innerJoin(users, eq(users.id, topics.ownerId))
		.where(inArray(topics.id, topicIds))
}

// a topic's owning team, with the user's id if they are an active member
type FeedTeamRow = { topicId: string; teamId: string; memberUserId: string | null } & Pick<
	typeof teams.$inferSelect,
	"name" | "avatarKey" | "isPublic"
>

// each topic's owning team, in one query across every topic
async function loadFeedTeamRows(topicIds: string[], userId: string | null): Promise<FeedTeamRow[]> {
	return db
		.select({
			topicId: topics.id,
			teamId: teams.id,
			name: teams.name,
			avatarKey: teams.avatarKey,
			isPublic: teams.isPublic,
			memberUserId: teamMembers.userId,
		})
		.from(topics)
		.innerJoin(teams, eq(teams.id, topics.teamId))
		.leftJoin(
			teamMembers,
			and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, userId ?? ""), eq(teamMembers.isActive, true)),
		)
		.where(inArray(topics.id, topicIds))
}

// how many teams each topic is shared with. the owning team has no row here
async function loadSharedTeamCountRows(
	topicIds: string[],
): Promise<(Pick<typeof teamTopics.$inferSelect, "topicId"> & { teamCount: number })[]> {
	return db
		.select({ topicId: teamTopics.topicId, teamCount: count() })
		.from(teamTopics)
		.where(inArray(teamTopics.topicId, topicIds))
		.groupBy(teamTopics.topicId)
}

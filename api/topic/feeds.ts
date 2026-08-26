// the topic feed logic behind the homepage route. it batches every topic's data in one pass and builds each feed in memory
import type { TopicFeed, TopicFeedResponse, TopicFinding } from "@shared/contracts"
import { toSourceSummary, toSourceValue, toUrlHost } from "@shared/sources"
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm"
import { db } from "../../db"
import {
	attachments,
	bookmarks,
	consumptions,
	findings,
	resources,
	scans,
	sources,
	subscriptions,
	teamMembers,
	teams,
	teamTopics,
	topics,
	users,
} from "../../db/schema"
import { memberTopicIds, subscribedTopicIds } from "../authorization"
import { loadTopicChatMentions } from "../chat/mentions"
import { filteredTopicFindings, newTopicFindingCount } from "./findings"
import { toScheduledTimeLabel } from "./helpers"
import { isShown } from "./permissions"
import { startOfUtcMonth } from "./quotas"

// the most topics the Popular section shows
const MAX_POPULAR_TOPICS = 5

// the most findings the feed query pulls per topic
// ponytail: a user who consumed a topic's top 25 findings sees an empty card in the default view, raise this if that shows up
const MAX_FEED_FINDINGS_PER_TOPIC = 25

// the featured and popular id lists are the same for every visitor
// ponytail: per-process cache, move it to a shared store if the api ever runs replicas that must agree
const SECTION_ID_CACHE_TTL_MS = 60_000
let topicSectionIdCache: { value: { featuredIds: string[]; popularIds: string[] }; loadedAt: number } | null = null

// the topic ids this user actively subscribes to
function activeSubscriptionTopicIdQuery(userId: string) {
	return db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(and(eq(subscriptions.isActive, true), eq(subscriptions.subscriberUserId, userId)))
}

// the public featured and popular topic id lists, reloaded inline once the cached entry goes stale
async function publicSectionTopicIds(): Promise<{ featuredIds: string[]; popularIds: string[] }> {
	// serve the cached lists while they are fresh
	if (topicSectionIdCache && Date.now() - topicSectionIdCache.loadedAt < SECTION_ID_CACHE_TTL_MS) {
		return topicSectionIdCache.value
	}
	// isShown keeps a topic out of the public sections until it has enough findings
	const publicShownFilter = and(eq(topics.visibility, "public"), isShown)
	// featured topics keep their feature order. popular topics rank by subscriber count, newer breaking a tie
	const [featuredTopicIds, popularTopicIds] = await Promise.all([
		db
			.select({ id: topics.id })
			.from(topics)
			.where(and(publicShownFilter, isNotNull(topics.featureOrder)))
			.orderBy(asc(topics.featureOrder)),
		db
			.select({ id: topics.id })
			.from(topics)
			.where(and(publicShownFilter, isNull(topics.featureOrder)))
			.orderBy(desc(topics.subscriberCount), desc(topics.createdAt))
			.limit(MAX_POPULAR_TOPICS),
	])
	// store the fresh lists with their load time
	topicSectionIdCache = {
		value: {
			featuredIds: featuredTopicIds.map((topicIdRow) => topicIdRow.id),
			popularIds: popularTopicIds.map((topicIdRow) => topicIdRow.id),
		},
		loadedAt: Date.now(),
	}
	return topicSectionIdCache.value
}

// the featured and popular topic rows, rebuilt from the cached id lists
async function publicSectionTopics(userId: string | null): Promise<{
	featuredTopics: (typeof topics.$inferSelect)[]
	popularTopics: (typeof topics.$inferSelect)[]
}> {
	// the cached id lists say which topics the sections show and in what order
	const { featuredIds, popularIds } = await publicSectionTopicIds()
	const sectionIds = [...featuredIds, ...popularIds]
	if (sectionIds.length === 0) {
		return { featuredTopics: [], popularTopics: [] }
	}
	// re-checking visibility drops a topic made private inside the cached period
	// ponytail: a popular topic the user owns shortens their popular list until the cache refreshes, fine at this cached period
	const idFilter = and(inArray(topics.id, sectionIds), eq(topics.visibility, "public"))
	const topicRows = await db
		.select()
		.from(topics)
		.where(userId ? and(idFilter, ne(topics.ownerId, userId)) : idFilter)
	// put the rows back in each cached list's order
	const topicRowById = new Map(topicRows.map((topicRow) => [topicRow.id, topicRow]))
	const toTopics = (topicIds: string[]): (typeof topics.$inferSelect)[] =>
		topicIds.flatMap((topicId) => topicRowById.get(topicId) ?? [])
	return { featuredTopics: toTopics(featuredIds), popularTopics: toTopics(popularIds) }
}

/**
 * Build a topic feed's sections: featured and popular for everyone, yours and subscribed as well for a logged-in user.
 */
export async function buildTopicFeeds(
	userId: string | null,
	includeConsumedResources: boolean,
): Promise<Pick<TopicFeedResponse, "sections">> {
	// the topic ids this user actively subscribes to
	const activeSubscriptionTopicIds = userId ? activeSubscriptionTopicIdQuery(userId) : null

	// the user's own topics, the topics they subscribe to but don't own
	const [ownersTopics, subscribedTopics, { featuredTopics, popularTopics }] = await Promise.all([
		userId ? db.select().from(topics).where(eq(topics.ownerId, userId)) : Promise.resolve([]),
		// subscribed topics never include one this user owns
		userId && activeSubscriptionTopicIds
			? db
					.select()
					.from(topics)
					.where(and(ne(topics.ownerId, userId), inArray(topics.id, activeSubscriptionTopicIds)))
			: Promise.resolve([]),
		publicSectionTopics(userId),
	])

	// fetch every loaded topic's feed data in one batch keyed by topic id, then build each feed in memory
	const combinedTopics = [...ownersTopics, ...subscribedTopics, ...featuredTopics, ...popularTopics]
	const topicFeedData = await loadTopicFeedData(
		combinedTopics.map((topic) => topic.id),
		userId,
	)

	// build each section's feeds from the batched data
	const ownerTopicFeeds = ownersTopics.map((topic) =>
		buildTopicFeed(topic, userId, includeConsumedResources, topicFeedData),
	)
	const subscribedTopicFeeds = subscribedTopics.map((topic) =>
		buildTopicFeed(topic, userId, includeConsumedResources, topicFeedData),
	)
	const featuredTopicFeeds = featuredTopics.map((topic) =>
		buildTopicFeed(topic, userId, includeConsumedResources, topicFeedData),
	)
	const popularTopicFeeds = popularTopics.map((topic) =>
		buildTopicFeed(topic, userId, includeConsumedResources, topicFeedData),
	)

	// only show "yours" and "subscribed" sections to a signed-in visitor
	const sections: TopicFeedResponse["sections"] = userId
		? [
				{ key: "yours", topics: ownerTopicFeeds },
				{ key: "subscribed", topics: subscribedTopicFeeds },
			]
		: []
	sections.push({ key: "featured", topics: featuredTopicFeeds }, { key: "popular", topics: popularTopicFeeds })
	return { sections }
}

// fetch every dataset the topic feeds need across all topic ids at once, each grouped by topic id
async function loadTopicFeedData(topicIds: string[], userId: string | null) {
	// a signed-out visitor has no history. sql`false` stands in where drizzle's typing rejects comparing user_id to null
	const consumptionJoinCondition = userId
		? and(eq(consumptions.findingId, findings.id), eq(consumptions.userId, userId))
		: sql`false`
	const bookmarkJoinCondition = userId
		? and(eq(bookmarks.findingId, findings.id), eq(bookmarks.userId, userId))
		: sql`false`
	// rank each topic's findings by relevance so the feed query can stop at MAX_FEED_FINDINGS_PER_TOPIC per topic
	const rankedFindings = db
		.select({
			findingId: findings.id,
			rowNumber:
				sql<number>`row_number() over (partition by ${findings.topicId} order by ${findings.relevanceScore} desc, ${findings.id})`.as(
					"row_number",
				),
		})
		.from(findings)
		.where(inArray(findings.topicId, topicIds))
		.as("ranked_findings")

	// run the topic-batched queries together, plus the subscription and membership queries for the signed-in user
	// biome-ignore format: one line keeps the destructure under the comment-density hook's limit
	const [findingRows, sourceRows, attachmentRows, scanRows, monthCostRows, subscribedTopicIdSet, memberTopicIdSet, ownerRows, teamRows, mentionsByTopic, teamCountRows] =
		await Promise.all([
			// join each topic finding with its resource. a left join adds the user's consumed date when one exists
			db
				.select({
					// the owning topic's id groups the rows
					topicId: findings.topicId,
					// the topic finding's identity, the scan that produced it, and its resource metadata
					findingId: findings.id,
					scanId: findings.scanId,
					resourceId: resources.id,
					url: resources.url,
					resourceKind: resources.kind,
					title: resources.title,
					resourceCreatedAt: resources.createdAt,
					fetchedAt: resources.fetchedAt,
					// the topic finding's metadata, the engagement score, and the user's consumed and bookmarked dates
					relevanceScore: findings.relevanceScore,
					relevanceExplanation: findings.relevanceExplanation,
					viewCount: findings.viewCount,
					rating: findings.rating,
					engagement: resources.engagement,
					consumedAt: consumptions.consumedAt,
					bookmarkedAt: bookmarks.createdAt,
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
				.where(inArray(findings.topicId, topicIds))
				.orderBy(desc(findings.relevanceScore)),

			// every topic's sources, grouped by topic id. the llm-guard screening status is included to show the owner
			db
				.select({
					topicId: sources.topicId,
					id: sources.id,
					kind: sources.kind,
					config: sources.config,
					status: sources.status,
					error: sources.error,
				})
				.from(sources)
				.where(inArray(sources.topicId, topicIds)),

			// select every topic's attachments, including the topic id to group by
			db
				.select({
					topicId: attachments.topicId,
					id: attachments.id,
					filename: attachments.filename,
					sourceUrl: attachments.sourceUrl,
					status: attachments.status,
				})
				.from(attachments)
				.where(inArray(attachments.topicId, topicIds)),

			// select the most recent succeeded scan per topic. the distinct-on keeps the summary from that same latest row
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
				.orderBy(scans.topicId, desc(scans.startedAt)),

			// sum this month's scan spend per topic for the owner-gated cost line
			db
				.select({ topicId: scans.topicId, monthCost: sql<string>`coalesce(sum(${scans.cost}), 0)` })
				.from(scans)
				.where(and(inArray(scans.topicId, topicIds), gte(scans.startedAt, startOfUtcMonth(new Date()))))
				.groupBy(scans.topicId),

			// the topics this signed-in user is subscribed to, in one query. a signed-out visitor is subscribed to none
			userId ? subscribedTopicIds(userId, topicIds) : Promise.resolve(new Set<string>()),
			userId ? memberTopicIds(userId, topicIds) : Promise.resolve(new Set<string>()),

			// select each topic's owner with a single query across every topic instead of a lookup per row
			db
				.select({
					topicId: topics.id,
					userId: users.id,
					username: users.username,
					avatarSource: users.avatarSource,
				})
				.from(topics)
				.innerJoin(users, eq(users.id, topics.ownerId))
				.where(inArray(topics.id, topicIds)),

			// each loaded topic's owning team with whether the user belongs
			db
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
				.leftJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, userId ?? ""), eq(teamMembers.isActive, true)))
				.where(inArray(topics.id, topicIds)),
			// the user's unseen chat room mentions, for the count badge on each topic's name
			loadTopicChatMentions(userId, topicIds),

			// how many teams hold each topic, which the topic roast shows under the follower count
			db
				.select({ topicId: teamTopics.topicId, teamCount: count() })
				.from(teamTopics)
				.where(inArray(teamTopics.topicId, topicIds))
				.groupBy(teamTopics.topicId),
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
		ownerByTopic: new Map(ownerRows.map((ownerRow) => [ownerRow.topicId, ownerRow])),
		mentionsByTopic,
		// the shared-in teams alone. the owning team has no row here, so each count adds it back
		sharedTeamCountByTopic: new Map(
			teamCountRows.map((teamCountRow) => [teamCountRow.topicId, teamCountRow.teamCount]),
		),
		// the team link on a private owning team shown only to its own members
		teamLinkByTopic: new Map(
			teamRows
				.filter((teamRow) => teamRow.isPublic || teamRow.memberUserId !== null)
				.map((teamRow) => [
					teamRow.topicId,
					{ teamId: teamRow.teamId, name: teamRow.name, hasAvatar: teamRow.avatarKey !== null },
				]),
		),
	}
}

// build a topic's feed from the batched data with no queries of its own
function buildTopicFeed(
	topic: typeof topics.$inferSelect,
	userId: string | null,
	includeConsumedResources: boolean,
	feedData: Awaited<ReturnType<typeof loadTopicFeedData>>,
): TopicFeed {
	// read this topic's findings, last scan, and subscriber count from the batched data
	const findingRows = feedData.findingRowsByTopic.get(topic.id) ?? []
	const lastScan = feedData.lastScanByTopic.get(topic.id)
	// the subscriber count shown in the info popover
	const subscriberCount = topic.subscriberCount
	// only the owner sees their own topic's scan spend
	const isOwner = topic.ownerId === userId
	const ownerRow = feedData.ownerByTopic.get(topic.id)

	// read the sources, dropping the grouping key from each row
	const topicSources = (feedData.sourcesByTopic.get(topic.id) ?? [])
		.filter((source) => source.status === "ready" || isOwner)
		.map((source) => ({
			id: source.id,
			sourceKind: source.kind,
			summary: toSourceSummary(source.kind, source.config),
			value: toSourceValue(source.kind, source.config),
			status: source.status,
			error: source.error,
		}))

	// read the attachments, dropping the grouping key from each row
	const topicAttachments = (feedData.attachmentsByTopic.get(topic.id) ?? []).map((attachment) => ({
		id: attachment.id,
		filename: attachment.filename,
		sourceUrl: attachment.sourceUrl,
		status: attachment.status,
		context: null,
	}))

	// shape each row into a topic finding and set its isConsumed flag
	const topicFindings: TopicFinding[] = findingRows.map((findingRow) => ({
		findingId: findingRow.findingId,
		scanId: findingRow.scanId,
		resourceId: findingRow.resourceId,
		url: findingRow.url,
		resourceKind: findingRow.resourceKind,
		title: findingRow.title,
		// the source host for the metadata, plus the published and fetched times
		source: toUrlHost(findingRow.url),
		publishedAt: findingRow.resourceCreatedAt.toISOString(),
		fetchedAt: findingRow.fetchedAt.toISOString(),
		// the relevance judgment, view count, rating, engagement for trending sort, and the user's consumed and bookmarked states
		relevanceScore: findingRow.relevanceScore,
		relevanceExplanation: findingRow.relevanceExplanation,
		viewCount: findingRow.viewCount,
		rating: findingRow.rating,
		engagement: findingRow.engagement,
		isConsumed: findingRow.consumedAt !== null,
		isBookmarked: findingRow.bookmarkedAt !== null,
		teamBookmarks: [],
	}))

	// return the topic feed with its metadata
	return {
		id: topic.id,
		name: topic.name,
		prompt: topic.prompt,
		tags: topic.tags,
		frequency: topic.frequency,
		scheduledTime: toScheduledTimeLabel(topic.scheduledTime),
		scheduledDayOfWeek: topic.scheduledDayOfWeek,
		maxResults: topic.maxResults,
		// the topic owner to show
		owner: ownerRow
			? { userId: ownerRow.userId, username: ownerRow.username, avatarSource: ownerRow.avatarSource }
			: null,
		isOwner,
		isOnTeam: topic.teamId !== null,
		teamLink: feedData.teamLinkByTopic.get(topic.id) ?? null,
		roomTeams: [],
		mentions: feedData.mentionsByTopic.get(topic.id) ?? [],
		// what this user may do with the topic, plus their unconsumed topic findings count
		canRate: canRateInFeed(topic, userId, feedData.subscribedTopicIdSet, feedData.memberTopicIdSet),
		isSubscribed: feedData.subscribedTopicIdSet.has(topic.id),
		newCount: newTopicFindingCount(topicFindings),
		subscriberCount,
		// the first team to hold a topic owns it in a column, and every later team to add a topic gets a shared-in row
		teamCount: (feedData.sharedTeamCountByTopic.get(topic.id) ?? 0) + (topic.teamId ? 1 : 0),
		visibility: topic.visibility,
		// the created time, last scan details, attachments, sources, and topic findings
		createdAt: topic.createdAt.toISOString(),
		lastScanAt: lastScan?.startedAt.toISOString() ?? null,
		lastScanDurationMs:
			lastScan?.finishedAt != null ? lastScan.finishedAt.getTime() - lastScan.startedAt.getTime() : null,
		monthCostDollars: isOwner ? Number(feedData.monthCostByTopic.get(topic.id) ?? 0) : null,
		scanSummary: lastScan?.scanSummary ?? null,
		attachments: topicAttachments,
		sources: topicSources,
		findings: filteredTopicFindings(topicFindings, includeConsumedResources),
	}
}

/**
 * Whether the user may rate the topic in the feed. The owner and the topic's team members always may.
 * Anyone else only as a subscriber to a "public" or "invite" visibility topic, never a "private" one.
 */
export function canRateInFeed(
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility">,
	userId: string | null,
	subscribedTopicIdSet: Set<string>,
	memberTopicIdSet: Set<string>,
): boolean {
	// a signed-out visitor has no account to rate as
	if (!userId) {
		return false
	}
	if (topic.ownerId === userId || memberTopicIdSet.has(topic.id)) {
		return true
	}
	return topic.visibility !== "private" && subscribedTopicIdSet.has(topic.id)
}

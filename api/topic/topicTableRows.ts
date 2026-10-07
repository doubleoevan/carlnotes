// the topic table rows that the profile page, the team page, and the team rows' topics render
import type { Topic } from "@shared/contracts"
import { and, count, eq, inArray, sql } from "drizzle-orm"
import { db, isFindingShown } from "../../db"
import { findings, scans, subscriptions, type topics } from "../../db/schema"
import { loadLatestPodcastEpisodes } from "../podcast/helpers"

/**
 * The topic table rows that the profile page and the team page both render.
 */
export async function toTopicTableRows(
	// the topics, each with the owner that the podcast episode access check reads
	topicRows: {
		id: string
		name: string
		ownerId: string
		visibility: (typeof topics.$inferSelect)["visibility"]
		createdAt: Date
		updatedAt: Date
		subscriberCount: number
	}[],
	// the signed-in user, whose email switch each row reads and whose access each podcast episode checks
	userId: string | null,
): Promise<Topic[]> {
	// kept counts the topic's findings saved, and seen sums the topic's findings that succeeded scans reviewed.
	// each topic also reads its latest podcast episode that the user may listen to
	const topicIds = topicRows.map((topicRow) => topicRow.id)
	const [keptAndSeenTopicFindings, emailByTopic, latestPodcastEpisodeByTopic] = await Promise.all([
		loadFindingsKeptAndResourcesSeen(topicIds),
		loadTopicsEmailPreferences(userId, topicIds),
		loadLatestPodcastEpisodes(topicRows, userId),
	])
	return topicRows.map((topicRow) => ({
		id: topicRow.id,
		name: topicRow.name,
		visibility: topicRow.visibility,
		createdAt: topicRow.createdAt.toISOString(),
		updatedAt: topicRow.updatedAt.toISOString(),
		subscriberCount: topicRow.subscriberCount,
		keptCount: keptAndSeenTopicFindings.get(topicRow.id)?.kept ?? 0,
		seenCount: keptAndSeenTopicFindings.get(topicRow.id)?.seen ?? 0,
		isEmailEnabled: emailByTopic.get(topicRow.id) ?? null,
		latestPodcastEpisode: latestPodcastEpisodeByTopic.get(topicRow.id) ?? null,
	}))
}

// the user's own email switch on each of their followed topics
async function loadTopicsEmailPreferences(
	userId: string | null | undefined,
	topicIds: string[],
): Promise<Map<string, boolean>> {
	if (!userId || topicIds.length === 0) {
		return new Map()
	}
	// one row per followed topic with its email enabled status
	const subscriptionRows = await db
		.select({ topicId: subscriptions.topicId, isEmailEnabled: subscriptions.isEmailEnabled })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
				inArray(subscriptions.topicId, topicIds),
			),
		)
	return new Map(subscriptionRows.map((subscriptionRow) => [subscriptionRow.topicId, subscriptionRow.isEmailEnabled]))
}

// topic findings kept and resources seen, per topic summed for every scan
async function loadFindingsKeptAndResourcesSeen(
	topicIds: string[],
): Promise<Map<string, { kept: number; seen: number }>> {
	if (topicIds.length === 0) {
		return new Map()
	}
	// kept is the findings the topic holds. seen is what its scans reviewed, kept and filtered together
	const [keptFindingRows, seenResourceRows] = await Promise.all([
		db
			.select({ topicId: findings.topicId, kept: count() })
			.from(findings)
			.where(and(inArray(findings.topicId, topicIds), isFindingShown))
			.groupBy(findings.topicId),
		db
			.select({
				topicId: scans.topicId,
				seen: sql<number>`coalesce(sum(${scans.keptCount} + ${scans.filteredCount}), 0)`,
			})
			.from(scans)
			.where(and(inArray(scans.topicId, topicIds), eq(scans.status, "succeeded")))
			.groupBy(scans.topicId),
	])

	// merge the two aggregates, with zero filling in for a topic absent from either
	const keptByTopicId = new Map(keptFindingRows.map((keptFindingRow) => [keptFindingRow.topicId, keptFindingRow.kept]))
	const seenByTopicId = new Map(
		seenResourceRows.map((seenResourceRow) => [seenResourceRow.topicId, Number(seenResourceRow.seen)]),
	)
	return new Map(
		topicIds.map((topicId) => [
			topicId,
			{ kept: keptByTopicId.get(topicId) ?? 0, seen: seenByTopicId.get(topicId) ?? 0 },
		]),
	)
}

// the topic feed logic behind the homepage route. it batches every topic's data in one pass and builds each feed in memory
import type { TopicFeed, TopicFeedResponse, TopicFinding } from "@shared/contracts"
import { and, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm"
import { db } from "../../db"
import { attachments, consumptions, findings, resources, scans, sources, subscriptions, topics } from "../../db/schema"
import { filteredTopicFindings, newTopicFindingCount, toUrlHost } from "./findings"
import { canRateTopic } from "./permissions"
import { startOfUtcMonth } from "./quotas"

// the most topics the Popular section shows
const MAX_POPULAR_TOPICS = 5

/**
 * build a topic feed's sections: yours, featured, and popular. the app isn't gated by auth, so userId may be
 * null for a signed-out visitor — they still get featured and popular, just no "yours" section.
 * the route merges the topic-creation quota in, so this returns the sections alone
 */
export async function buildTopicFeeds(
	userId: string | null,
	includeConsumedResources: boolean,
): Promise<Pick<TopicFeedResponse, "sections">> {
	// a signed-out visitor owns nothing, and every public topic counts as "other" since there's no "mine" to exclude
	const othersFilter = userId
		? and(ne(topics.ownerId, userId), eq(topics.visibility, "public"))
		: eq(topics.visibility, "public")
	const [ownersTopics, othersTopics] = await Promise.all([
		userId ? db.select().from(topics).where(eq(topics.ownerId, userId)) : Promise.resolve([]),
		db.select().from(topics).where(othersFilter),
	])

	// fetch every topic's feed data in one batch keyed by topic id, then build each feed in memory
	const combinedTopics = [...ownersTopics, ...othersTopics]
	const topicFeedData = await loadTopicFeedData(
		combinedTopics.map((topic) => topic.id),
		userId,
	)

	// build the topic feed for each of the user's own topics
	const ownerTopicFeeds = await Promise.all(
		ownersTopics.map((topic) => buildTopicFeed(topic, userId, includeConsumedResources, topicFeedData)),
	)

	// build each public topic's feed, keeping its topic row for the featured and popular sorts
	const othersTopicFeeds = await Promise.all(
		othersTopics.map(async (topic) => ({
			topic,
			feed: await buildTopicFeed(topic, userId, includeConsumedResources, topicFeedData),
		})),
	)

	// sort featured topics by featureOrder ascending
	const featuredTopicFeeds = othersTopicFeeds
		.filter((topicFeed) => topicFeed.topic.featureOrder !== null)
		.sort(
			(firstTopicFeed, secondTopicFeed) =>
				(firstTopicFeed.topic.featureOrder ?? 0) - (secondTopicFeed.topic.featureOrder ?? 0),
		)
		.map((topicFeed) => topicFeed.feed)

	// sort popular topics by subscriber count descending
	const popularTopicFeeds = othersTopicFeeds
		.map((topicFeed) => topicFeed.feed)
		.sort((firstTopicFeed, secondTopicFeed) => secondTopicFeed.subscriberCount - firstTopicFeed.subscriberCount)
		.slice(0, MAX_POPULAR_TOPICS)

	// "Your Topics" only makes sense for a signed-in visitor. featured and popular are public regardless of session
	const sections: TopicFeedResponse["sections"] = userId ? [{ key: "yours", topics: ownerTopicFeeds }] : []
	sections.push({ key: "featured", topics: featuredTopicFeeds }, { key: "popular", topics: popularTopicFeeds })
	return { sections }
}

// fetch every dataset the topic feeds need across all topic ids at once, each grouped by topic id.
// an empty id list makes each inArray where clause match nothing, so the maps come back empty
async function loadTopicFeedData(topicIds: string[], userId: string | null) {
	// a signed-out visitor has no consumption history. sql`false` forces the left join to never match,
	// rather than comparing consumptions.user_id against null, which drizzle's column typing rejects
	const consumptionJoinCondition = userId
		? and(eq(consumptions.findingId, findings.id), eq(consumptions.userId, userId))
		: sql`false`
	// run the five topic-batched queries together
	const [findingRows, sourceRows, attachmentRows, scanRows, subscriberRows, monthCostRows] = await Promise.all([
		// join each topic finding with its resource. a left join adds the user's consumed date when one exists
		db
			.select({
				// the owning topic's id groups the rows
				topicId: findings.topicId,
				// the topic finding's identity and its resource metadata
				findingId: findings.id,
				resourceId: resources.id,
				url: resources.url,
				resourceKind: resources.kind,
				title: resources.title,
				resourceCreatedAt: resources.createdAt,
				fetchedAt: resources.fetchedAt,
				// the topic finding's metadata and the user's consumed date
				relevanceScore: findings.relevanceScore,
				relevanceExplanation: findings.relevanceExplanation,
				viewCount: findings.viewCount,
				rating: findings.rating,
				consumedAt: consumptions.consumedAt,
			})
			// join the resource and the user's consumed row. sort by relevance score descending
			.from(findings)
			.innerJoin(resources, eq(findings.resourceId, resources.id))
			.leftJoin(consumptions, consumptionJoinCondition)
			.where(inArray(findings.topicId, topicIds))
			.orderBy(desc(findings.relevanceScore)),

		// select every topic's sources, carrying the topic id to group by
		db
			.select({ topicId: sources.topicId, id: sources.id, kind: sources.kind })
			.from(sources)
			.where(inArray(sources.topicId, topicIds)),

		// select every topic's attachments, carrying the topic id to group by
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

		// select the subscriber count per topic
		db
			.select({ topicId: subscriptions.topicId, count: count() })
			.from(subscriptions)
			.where(inArray(subscriptions.topicId, topicIds))
			.groupBy(subscriptions.topicId),

		// sum this month's scan spend per topic for the owner-gated cost line
		db
			.select({ topicId: scans.topicId, monthCost: sql<string>`coalesce(sum(${scans.cost}), 0)` })
			.from(scans)
			.where(and(inArray(scans.topicId, topicIds), gte(scans.startedAt, startOfUtcMonth(new Date()))))
			.groupBy(scans.topicId),
	])

	// group each dataset by topic id so that a feed can read its slice in memory
	return {
		findingRowsByTopic: Map.groupBy(findingRows, (row) => row.topicId),
		sourcesByTopic: Map.groupBy(sourceRows, (row) => row.topicId),
		attachmentsByTopic: Map.groupBy(attachmentRows, (row) => row.topicId),
		lastScanByTopic: new Map(scanRows.map((row) => [row.topicId, row])),
		subscriberCountByTopic: new Map(subscriberRows.map((row) => [row.topicId, row.count])),
		monthCostByTopic: new Map(monthCostRows.map((row) => [row.topicId, row.monthCost])),
	}
}

// build a topic's feed from the batched data. that includes its topic findings, sources, attachments, last scan, and subscriber count
async function buildTopicFeed(
	topic: typeof topics.$inferSelect,
	userId: string | null,
	includeConsumedResources: boolean,
	feedData: Awaited<ReturnType<typeof loadTopicFeedData>>,
): Promise<TopicFeed> {
	// read this topic's findings, last scan, and subscriber count from the batched data
	const findingRows = feedData.findingRowsByTopic.get(topic.id) ?? []
	const lastScan = feedData.lastScanByTopic.get(topic.id)
	const subscriberCount = feedData.subscriberCountByTopic.get(topic.id) ?? 0
	// the owner sees their topic's scan spend. others never do
	const isOwner = topic.ownerId === userId

	// read the sources, dropping the grouping key from each row
	const topicSources = (feedData.sourcesByTopic.get(topic.id) ?? []).map((source) => ({
		id: source.id,
		kind: source.kind,
	}))

	// read the attachments, dropping the grouping key from each row
	const topicAttachments = (feedData.attachmentsByTopic.get(topic.id) ?? []).map((attachment) => ({
		id: attachment.id,
		filename: attachment.filename,
		sourceUrl: attachment.sourceUrl,
		status: attachment.status,
	}))

	// shape each row into a topic finding and set its isConsumed flag
	const topicFindings: TopicFinding[] = findingRows.map((row) => ({
		findingId: row.findingId,
		resourceId: row.resourceId,
		url: row.url,
		resourceKind: row.resourceKind,
		title: row.title,
		// the source host for the metadata, plus the published and fetched times
		source: toUrlHost(row.url),
		publishedAt: row.resourceCreatedAt.toISOString(),
		fetchedAt: row.fetchedAt.toISOString(),
		// the relevance judgment, view count, rating, and the user's consumed state
		relevanceScore: row.relevanceScore,
		relevanceExplanation: row.relevanceExplanation,
		viewCount: row.viewCount,
		rating: row.rating,
		isConsumed: row.consumedAt !== null,
	}))

	// return the topic feed with its metadata
	return {
		id: topic.id,
		name: topic.name,
		prompt: topic.prompt,
		tags: topic.tags,
		frequency: topic.frequency,
		// what this user may do with the topic, plus their unconsumed count
		isOwner,
		canRate: await canRateTopic(userId, topic),
		newCount: newTopicFindingCount(topicFindings),
		// how many subscribers this topic has
		subscriberCount,
		// the created time, last scan details, attachments, sources, and topic findings
		createdAt: topic.createdAt.toISOString(),
		lastScanAt: lastScan?.startedAt.toISOString() ?? null,
		lastScanDurationMs:
			lastScan?.finishedAt != null ? lastScan.finishedAt.getTime() - lastScan.startedAt.getTime() : null,
		monthCost: isOwner ? Number(feedData.monthCostByTopic.get(topic.id) ?? 0) : null,
		scanSummary: lastScan?.scanSummary ?? null,
		attachments: topicAttachments,
		sources: topicSources,
		findings: filteredTopicFindings(topicFindings, includeConsumedResources),
	}
}

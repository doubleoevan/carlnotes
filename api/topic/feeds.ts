// the topic feed logic behind the homepage route. it batches every topic's data in one pass and builds each feed in memory
import type { TopicFeed, TopicFeedResponse, TopicFinding } from "@shared/contracts"
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm"
import { db } from "../../db"
import {
	attachments,
	audienceMembers,
	bookmarks,
	consumptions,
	findings,
	resources,
	scans,
	sources,
	subscriptions,
	topics,
} from "../../db/schema"
import { subscribedTopicIds } from "../authorization"
import { filteredTopicFindings, newTopicFindingCount, toUrlHost } from "./findings"
import { startOfUtcMonth } from "./quotas"
import { toScheduledTimeLabel } from "./topics"

// the most topics the Popular section shows
const MAX_POPULAR_TOPICS = 5

// the topic ids this user actively subscribes to, directly or through an audience they belong to
function activeSubscriptionTopicIdQuery(userId: string) {
	// the audiences this user belongs to, a subquery rather than a separate round trip since it only feeds the query below
	const memberAudiences = db
		.select({ audienceId: audienceMembers.audienceId })
		.from(audienceMembers)
		.where(eq(audienceMembers.userId, userId))
	// the subscriber is either the user directly or one of those audiences, and the row must be active
	return db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.isActive, true),
				or(eq(subscriptions.subscriberUserId, userId), inArray(subscriptions.subscriberAudienceId, memberAudiences)),
			),
		)
}

/**
 * Build a topic feed's sections: featured and popular for everyone, yours and subscribed as well for a logged-in user.
 */
export async function buildTopicFeeds(
	userId: string | null,
	includeConsumedResources: boolean,
): Promise<Pick<TopicFeedResponse, "sections">> {
	// a signed-out visitor owns nothing, and every public topic counts as "other"
	const othersFilter = userId
		? and(ne(topics.ownerId, userId), eq(topics.visibility, "public"))
		: eq(topics.visibility, "public")
	// a correlated subscriber count, used to rank the popular section in SQL so topics that won't render never load.
	// the owner's own row is excluded, since they subscribe to their own topic for delivery and don't count as a subscriber
	const subscriberCount = sql<number>`(select count(*) from ${subscriptions} where ${subscriptions.topicId} = ${topics.id} and ${subscriptions.isActive} = true and ${subscriptions.subscriberUserId} is distinct from ${topics.ownerId})`

	// the topic ids this user actively subscribes to
	const activeSubscriptionTopicIds = userId ? activeSubscriptionTopicIdQuery(userId) : null

	// the user's own topics, the topics they subscribe to but don't own, the featured public topics,
	// and the top-N non-featured popular topics by subscriber count
	const [ownersTopics, subscribedTopics, featuredTopics, popularTopics] = await Promise.all([
		userId ? db.select().from(topics).where(eq(topics.ownerId, userId)) : Promise.resolve([]),
		// subscribed topics never include one this user owns
		userId && activeSubscriptionTopicIds
			? db
					.select()
					.from(topics)
					.where(and(ne(topics.ownerId, userId), inArray(topics.id, activeSubscriptionTopicIds)))
			: Promise.resolve([]),
		// featured topics keep their feature order
		db
			.select()
			.from(topics)
			.where(and(othersFilter, isNotNull(topics.featureOrder)))
			.orderBy(asc(topics.featureOrder)),
		// popular topics rank by subscriber count, capped before any feed data loads for them
		db
			.select()
			.from(topics)
			.where(and(othersFilter, isNull(topics.featureOrder)))
			.orderBy(desc(subscriberCount))
			.limit(MAX_POPULAR_TOPICS),
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

// fetch every dataset the topic feeds need across all topic ids at once, each grouped by topic id.
// an empty id list makes each inArray where clause match nothing, so the maps come back empty
async function loadTopicFeedData(topicIds: string[], userId: string | null) {
	// a signed-out visitor has no consumption or bookmark history. sql`false` forces each left join to never
	// match, rather than comparing a user_id column against null, which drizzle's column typing rejects
	const consumptionJoinCondition = userId
		? and(eq(consumptions.findingId, findings.id), eq(consumptions.userId, userId))
		: sql`false`
	const bookmarkJoinCondition = userId
		? and(eq(bookmarks.findingId, findings.id), eq(bookmarks.userId, userId))
		: sql`false`
	// run the topic-batched queries together, plus the subscription query for the signed-in user
	const [findingRows, sourceRows, attachmentRows, scanRows, subscriberRows, monthCostRows, subscribedTopicIdSet] =
		await Promise.all([
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
					// the topic finding's metadata, the engagement score, and the user's consumed and bookmarked dates
					relevanceScore: findings.relevanceScore,
					relevanceExplanation: findings.relevanceExplanation,
					viewCount: findings.viewCount,
					rating: findings.rating,
					engagement: resources.engagement,
					consumedAt: consumptions.consumedAt,
					bookmarkedAt: bookmarks.createdAt,
				})
				// join the resource and the user's consumed and bookmark rows. sort by relevance score descending
				.from(findings)
				.innerJoin(resources, eq(findings.resourceId, resources.id))
				.leftJoin(consumptions, consumptionJoinCondition)
				.leftJoin(bookmarks, bookmarkJoinCondition)
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

			// select the subscriber count per topic. unsubscribing deactivates the row rather than deleting it,
			// so only active rows count. the join to the topic is what lets the owner's own row drop out
			db
				.select({ topicId: subscriptions.topicId, count: count() })
				.from(subscriptions)
				.innerJoin(topics, eq(subscriptions.topicId, topics.id))
				.where(
					and(
						inArray(subscriptions.topicId, topicIds),
						eq(subscriptions.isActive, true),
						sql`${subscriptions.subscriberUserId} is distinct from ${topics.ownerId}`,
					),
				)
				.groupBy(subscriptions.topicId),

			// sum this month's scan spend per topic for the owner-gated cost line
			db
				.select({ topicId: scans.topicId, monthCost: sql<string>`coalesce(sum(${scans.cost}), 0)` })
				.from(scans)
				.where(and(inArray(scans.topicId, topicIds), gte(scans.startedAt, startOfUtcMonth(new Date()))))
				.groupBy(scans.topicId),

			// the topics this signed-in user is subscribed to, in one query. a signed-out visitor is subscribed to none
			userId ? subscribedTopicIds(userId, topicIds) : Promise.resolve(new Set<string>()),
		])

	// group each dataset by topic id so that a feed can read its slice in memory
	return {
		findingRowsByTopic: Map.groupBy(findingRows, (row) => row.topicId),
		sourcesByTopic: Map.groupBy(sourceRows, (row) => row.topicId),
		attachmentsByTopic: Map.groupBy(attachmentRows, (row) => row.topicId),
		lastScanByTopic: new Map(scanRows.map((row) => [row.topicId, row])),
		subscriberCountByTopic: new Map(subscriberRows.map((row) => [row.topicId, row.count])),
		monthCostByTopic: new Map(monthCostRows.map((row) => [row.topicId, row.monthCost])),
		// the topic ids this user is subscribed to
		subscribedTopicIdSet,
	}
}

// build a topic's feed from the batched data with no queries of its own.
// that includes its topic findings, sources, attachments, last scan, subscriber count, and rate-eligibility
function buildTopicFeed(
	topic: typeof topics.$inferSelect,
	userId: string | null,
	includeConsumedResources: boolean,
	feedData: Awaited<ReturnType<typeof loadTopicFeedData>>,
): TopicFeed {
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
		// the relevance judgment, view count, rating, engagement for trending sort, and the user's consumed and bookmarked states
		relevanceScore: row.relevanceScore,
		relevanceExplanation: row.relevanceExplanation,
		viewCount: row.viewCount,
		rating: row.rating,
		engagement: row.engagement,
		isConsumed: row.consumedAt !== null,
		isBookmarked: row.bookmarkedAt !== null,
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
		// what this user may do with the topic, plus their unconsumed count
		isOwner,
		canRate: canRateInFeed(topic, userId, feedData.subscribedTopicIdSet),
		isSubscribed: feedData.subscribedTopicIdSet.has(topic.id),
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

/**
 * Whether the user may rate the topic in the feed. The owner always may.
 * Anyone else only as a subscriber to a "public" or "invite" visibility topic, never a "private" one.
 */
export function canRateInFeed(
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility">,
	userId: string | null,
	subscribedTopicIdSet: Set<string>,
): boolean {
	// a signed-out visitor has no account to rate as, stated here rather than left to an empty subscriber set
	if (!userId) {
		return false
	}
	return topic.ownerId === userId || (topic.visibility !== "private" && subscribedTopicIdSet.has(topic.id))
}

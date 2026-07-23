// the topic feed logic behind the api routes. it builds a user's topic feeds and records ratings, views, and consumed state
import type { TopicFeed, TopicFeedResponse, TopicFinding } from "@shared/contracts"
import { and, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm"
import { db } from "../db"
import {
	attachments,
	audienceMembers,
	consumptions,
	findings,
	resources,
	scans,
	sources,
	subscriptions,
	topics,
} from "../db/schema"

const MAX_POPULAR_TOPICS = 5

/**
 * build a user's topic feed sections: yours, featured, and popular
 */
export async function buildTopicFeeds(userId: string, includeConsumedResources: boolean): Promise<TopicFeedResponse> {
	// split topics into the user's own and other users' public topics
	const [ownersTopics, othersTopics] = await Promise.all([
		db.select().from(topics).where(eq(topics.ownerId, userId)),
		db
			.select()
			.from(topics)
			.where(and(ne(topics.ownerId, userId), eq(topics.visibility, "public"))),
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

	// return the topic sections
	return {
		sections: [
			{ key: "yours", topics: ownerTopicFeeds },
			{ key: "featured", topics: featuredTopicFeeds },
			{ key: "popular", topics: popularTopicFeeds },
		],
	}
}

// fetch every dataset the topic feeds need across all topic ids at once, each grouped by topic id.
// an empty id list makes each inArray where clause match nothing, so the maps come back empty
async function loadTopicFeedData(topicIds: string[], userId: string) {
	// run the five topic-batched queries together
	const [findingRows, sourceRows, attachmentRows, scanRows, subscriberRows] = await Promise.all([
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
			.leftJoin(consumptions, and(eq(consumptions.findingId, findings.id), eq(consumptions.userId, userId)))
			.where(inArray(findings.topicId, topicIds))
			.orderBy(desc(findings.relevanceScore)),

		// select every topic's sources, carrying the topic id to group by
		db
			.select({ topicId: sources.topicId, id: sources.id, kind: sources.kind })
			.from(sources)
			.where(inArray(sources.topicId, topicIds)),

		// select every topic's attachments, carrying the topic id to group by
		db
			.select({ topicId: attachments.topicId, id: attachments.id, filename: attachments.filename })
			.from(attachments)
			.where(inArray(attachments.topicId, topicIds)),

		// select the most recent succeeded scan per topic. the distinct-on keeps the summary from that same latest row
		db
			.selectDistinctOn([scans.topicId], {
				topicId: scans.topicId,
				startedAt: scans.startedAt,
				scanSummary: scans.scanSummary,
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
	])

	// group each dataset by topic id so that a feed can read its slice in memory
	return {
		findingRowsByTopic: Map.groupBy(findingRows, (row) => row.topicId),
		sourcesByTopic: Map.groupBy(sourceRows, (row) => row.topicId),
		attachmentsByTopic: Map.groupBy(attachmentRows, (row) => row.topicId),
		lastScanByTopic: new Map(scanRows.map((row) => [row.topicId, row])),
		subscriberCountByTopic: new Map(subscriberRows.map((row) => [row.topicId, row.count])),
	}
}

// build a topic's feed from the batched data. that includes its topic findings, sources, attachments, last scan, and subscriber count
async function buildTopicFeed(
	topic: typeof topics.$inferSelect,
	userId: string,
	includeConsumedResources: boolean,
	feedData: Awaited<ReturnType<typeof loadTopicFeedData>>,
): Promise<TopicFeed> {
	// read this topic's findings, last scan, and subscriber count from the batched data
	const findingRows = feedData.findingRowsByTopic.get(topic.id) ?? []
	const lastScan = feedData.lastScanByTopic.get(topic.id)
	const subscriberCount = feedData.subscriberCountByTopic.get(topic.id) ?? 0

	// read the sources, dropping the grouping key from each row
	const topicSources = (feedData.sourcesByTopic.get(topic.id) ?? []).map((source) => ({
		id: source.id,
		kind: source.kind,
	}))

	// read the attachments, dropping the grouping key from each row
	const topicAttachments = (feedData.attachmentsByTopic.get(topic.id) ?? []).map((attachment) => ({
		id: attachment.id,
		filename: attachment.filename,
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
		isOwner: topic.ownerId === userId,
		canRate: await canRateTopic(userId, topic),
		newCount: newTopicFindingCount(topicFindings),
		// how many subscribers this topic has
		subscriberCount,
		// the created time, last scan details, attachments, sources, and topic findings
		createdAt: topic.createdAt.toISOString(),
		lastScanAt: lastScan?.startedAt.toISOString() ?? null,
		scanSummary: lastScan?.scanSummary ?? null,
		attachments: topicAttachments,
		sources: topicSources,
		findings: filteredTopicFindings(topicFindings, includeConsumedResources),
	}
}

// set a topic finding's rating to thumbs up or down, or clear it. returns false when the user may not act on it
export async function setRating(userId: string, findingId: string, value: "up" | "down" | null): Promise<boolean> {
	if (!(await canRateFinding(userId, findingId))) {
		return false
	}
	await db.update(findings).set({ rating: value }).where(eq(findings.id, findingId))
	return true
}

// mark or unmark a topic finding consumed. returns false when the user may not act on it
export async function setConsumed(userId: string, findingId: string, isConsumed: boolean): Promise<boolean> {
	if (!(await isFindingTopicVisible(userId, findingId))) {
		return false
	}
	await writeConsumed(userId, findingId, isConsumed)
	return true
}

// increment the topic finding's view count and mark it consumed. returns false when the user may not act on it
export async function recordView(userId: string, findingId: string): Promise<boolean> {
	if (!(await isFindingTopicVisible(userId, findingId))) {
		return false
	}

	// increment the view count with a raw SQL expression, then mark the finding consumed
	await db
		.update(findings)
		.set({ viewCount: sql`${findings.viewCount} + 1` })
		.where(eq(findings.id, findingId))
	await writeConsumed(userId, findingId, true)
	return true
}

// insert or delete the consumed row. the exported callers run the access check first, so this one does not
async function writeConsumed(userId: string, findingId: string, isConsumed: boolean): Promise<void> {
	// to unmark isConsumed, delete the topic finding's consumed row
	if (!isConsumed) {
		await db.delete(consumptions).where(and(eq(consumptions.userId, userId), eq(consumptions.findingId, findingId)))
		return
	}

	// to mark isConsumed, insert the topic finding's consumed row. a duplicate insert does nothing
	await db.insert(consumptions).values({ userId, findingId }).onConflictDoNothing()
}

// a rating is written on the shared topic finding, so it takes the topic's owner or one of its
// subscribers. a private topic has no subscribers, so it stays owner-only
async function canRateFinding(userId: string, findingId: string): Promise<boolean> {
	const topic = await loadFindingTopic(findingId)
	return topic ? canRateTopic(userId, topic) : false
}

// the same rule against a topic row the caller already loaded, so the feed can flag each topic once
export async function canRateTopic(
	userId: string,
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility">,
): Promise<boolean> {
	// the owner may always rate
	if (topic.ownerId === userId) {
		return true
	}
	// a non-owner may rate only as a subscriber, and a private topic never has one
	switch (topic.visibility) {
		case "public":
		case "invite":
			return hasSubscription(userId, topic.id)
		case "private":
			return false
		// a new visibility value fails to compile here
		default:
			return assertNever(topic.visibility)
	}
}

// consumed state and view counts are the user's own reading history, so merely seeing the topic is enough.
// a "public" topic is visible to everyone
// a "private" topic is only visible to the owner
// an "invite" topic is only visible to its owner and its subscribers
async function isFindingTopicVisible(userId: string, findingId: string): Promise<boolean> {
	const topic = await loadFindingTopic(findingId)
	if (!topic) {
		return false
	}

	// the owner always sees their own topic
	if (topic.ownerId === userId) {
		return true
	}
	// a non-owner sees a public topic outright and an invite topic only as a subscriber, never a private one
	switch (topic.visibility) {
		case "public":
			return true
		case "invite":
			return hasSubscription(userId, topic.id)
		case "private":
			return false
		// a new visibility value fails to compile here
		default:
			return assertNever(topic.visibility)
	}
}

// the id, owner, and visibility of a topic finding's topic, or undefined when the finding does not exist
async function loadFindingTopic(findingId: string) {
	const [topic] = await db
		.select({ id: topics.id, ownerId: topics.ownerId, visibility: topics.visibility })
		.from(findings)
		.innerJoin(topics, eq(findings.topicId, topics.id))
		.where(eq(findings.id, findingId))
		.limit(1)
	// undefined when the finding id matches nothing
	return topic
}

// a subscription reaches a topic through the user directly or through an audience they belong to
async function hasSubscription(userId: string, topicId: string): Promise<boolean> {
	// collect the audiences the user belongs to for the audience path
	const memberAudiences = db
		.select({ audienceId: audienceMembers.audienceId })
		.from(audienceMembers)
		.where(eq(audienceMembers.userId, userId))

	// the subscriber is either the user directly or one of those audiences
	const subscriberMatches = or(
		eq(subscriptions.subscriberUserId, userId),
		inArray(subscriptions.subscriberAudienceId, memberAudiences),
	)

	// a matching subscription row on this topic is the grant
	const [subscription] = await db
		.select({ id: subscriptions.id })
		.from(subscriptions)
		.where(and(eq(subscriptions.topicId, topicId), subscriberMatches))
		.limit(1)
	return subscription !== undefined
}

// the default topic feed hides consumed topic findings. the "All" view keeps them
export function filteredTopicFindings(topicFindings: TopicFinding[], includeConsumed: boolean): TopicFinding[] {
	return includeConsumed ? topicFindings : topicFindings.filter((finding) => !finding.isConsumed)
}

// "# new" is the count of topic findings that the user has not consumed
export function newTopicFindingCount(topicFindings: TopicFinding[]): number {
	return topicFindings.filter((finding) => !finding.isConsumed).length
}

// return the host for the url or null if the url is invalid
export function toUrlHost(url: string): string | null {
	try {
		return new URL(url).host
	} catch {
		return null
	}
}

// exhaustiveness guard. a compile error here means a topic visibility case went unhandled above
function assertNever(value: never): never {
	throw new Error(`unhandled case: ${value}`)
}

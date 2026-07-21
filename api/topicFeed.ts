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
	const ownersTopics = await db.select().from(topics).where(eq(topics.ownerId, userId))
	const othersTopics = await db
		.select()
		.from(topics)
		.where(and(ne(topics.ownerId, userId), eq(topics.visibility, "public")))

	// load the topic feed for each topic
	const ownerTopicFeeds = await Promise.all(
		ownersTopics.map((topic) => loadTopicFeed(topic, userId, includeConsumedResources)),
	)
	const othersTopicFeeds = await Promise.all(
		othersTopics.map(async (topic) => ({ topic, feed: await loadTopicFeed(topic, userId, includeConsumedResources) })),
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

// load one topic's feed. that includes its topic findings, sources, attachments, last scan, and subscriber count
async function loadTopicFeed(
	topic: typeof topics.$inferSelect,
	userId: string,
	includeConsumedResources: boolean,
): Promise<TopicFeed> {
	// join each topic finding to its resource. a left join adds the user's consumed date when one exists
	const rows = await db
		.select({
			// load the finding identity and its resource metadata
			findingId: findings.id,
			resourceId: resources.id,
			url: resources.url,
			resourceKind: resources.kind,
			title: resources.title,
			resourceCreatedAt: resources.createdAt,
			fetchedAt: resources.fetchedAt,

			// load the finding metadata and the user's consumed date
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
		.where(eq(findings.topicId, topic.id))
		.orderBy(desc(findings.relevanceScore))

	// shape each row into a topic finding and set its isConsumed flag
	const cards: TopicFinding[] = rows.map((row) => ({
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

	// select the topic's sources and attachments
	const topicSources = await db
		.select({ id: sources.id, kind: sources.kind })
		.from(sources)
		.where(eq(sources.topicId, topic.id))
	const topicAttachments = await db
		.select({ id: attachments.id, filename: attachments.filename })
		.from(attachments)
		.where(eq(attachments.topicId, topic.id))

	// select the most recent succeeded scan with its start time and summary
	const lastScan = await db
		.select({ startedAt: scans.startedAt, scanSummary: scans.scanSummary })
		.from(scans)
		.where(and(eq(scans.topicId, topic.id), eq(scans.status, "succeeded")))
		.orderBy(desc(scans.startedAt))
		.limit(1)

	// select the topic's subscriber count
	const subscriberRows = await db
		.select({ count: count() })
		.from(subscriptions)
		.where(eq(subscriptions.topicId, topic.id))

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
		newCount: newTopicFindingCount(cards),
		// set how many subscribers this topic has
		subscriberCount: subscriberRows[0]?.count ?? 0,
		// set the created time, last scan details, attachments, sources, and topic findings
		createdAt: topic.createdAt.toISOString(),
		lastScanAt: lastScan[0]?.startedAt?.toISOString() ?? null,
		scanSummary: lastScan[0]?.scanSummary ?? null,
		attachments: topicAttachments,
		sources: topicSources,
		findings: filteredTopicFindings(cards, includeConsumedResources),
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
	if (!(await canSeeFinding(userId, findingId))) {
		return false
	}
	await writeConsumed(userId, findingId, isConsumed)
	return true
}

// increment the topic finding's view count and mark it consumed. returns false when the user may not act on it
export async function recordView(userId: string, findingId: string): Promise<boolean> {
	if (!(await canSeeFinding(userId, findingId))) {
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
	const topic = await findingTopic(findingId)
	return topic ? canRateTopic(userId, topic) : false
}

// the same rule against a topic row the caller already loaded, so the feed can flag each topic once
export async function canRateTopic(
	userId: string,
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility">,
): Promise<boolean> {
	// the owner may always rate, and a private topic offers no other way in
	if (topic.ownerId === userId) {
		return true
	}
	if (topic.visibility === "private") {
		return false
	}
	return hasSubscription(userId, topic.id)
}

// consumed state and view counts are the user's own reading history, so merely seeing the topic is
// enough. a public topic is visible to everyone and an invite topic only to its subscribers
async function canSeeFinding(userId: string, findingId: string): Promise<boolean> {
	const topic = await findingTopic(findingId)
	if (!topic) {
		return false
	}

	// the owner and any public topic are visible outright
	if (topic.ownerId === userId || topic.visibility === "public") {
		return true
	}
	if (topic.visibility === "private") {
		return false
	}
	return hasSubscription(userId, topic.id)
}

// the owner and visibility of a topic finding's topic, or undefined when the finding does not exist
async function findingTopic(findingId: string) {
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

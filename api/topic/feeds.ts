// the topic feed logic for the homepage route. it batches every topic's data in one pass and builds each feed in memory
import { toAvatarVersion } from "@shared/avatars"
import type { TopicFinding } from "@shared/contracts/findings"
import type { TopicFeed, TopicFeedResponse } from "@shared/contracts/topics"
import { traceRequestStage } from "@shared/monitoring"
import { toSourceSummary, toSourceValue } from "@shared/sources"
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm"
import { db, isPublicAndShown } from "../../db"
import { cacheJson, deleteRedisKey } from "../../db/redis"
import { subscriptions, topics } from "../../db/schema/topics"
import { attachTopicFindingFaviconPaths } from "../favicons"
import { loadTopicFeedData } from "./feedData"
import { filteredTopicFindings, newTopicFindingCount, toTopicFinding } from "./findings"
import { toScheduledTimeLabel } from "./helpers"

// the Redis key every replica reads the featured and popular topic id lists through, and how long they are kept
const TOPIC_SECTION_IDS_KEY = "topic-section-ids"
const TOPIC_SECTION_IDS_TTL_MS = 60_000

// how many popular topic ids the homepage keeps, ten pages of its five
const MAX_POPULAR_TOPIC_IDS = 50

// the featured and popular topic id lists
type TopicSectionIds = { featuredIds: string[]; popularIds: string[] }

// the topic ids this user actively subscribes to
function activeSubscriptionTopicIdQuery(userId: string) {
	return db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(and(eq(subscriptions.isActive, true), eq(subscriptions.subscriberUserId, userId)))
}

/**
 * Deletes the shared topic section id lists, so the next feed build on any replica reads them fresh.
 */
export function clearTopicSectionIdCache(): Promise<void> {
	return deleteRedisKey(TOPIC_SECTION_IDS_KEY)
}

/**
 * Returns the public featured and popular topic id lists, read through the shared Redis key for a minute.
 */
export function readPublicSectionTopicIds(): Promise<TopicSectionIds> {
	return cacheJson({ key: TOPIC_SECTION_IDS_KEY, ttlMs: TOPIC_SECTION_IDS_TTL_MS, load: loadPublicSectionTopicIds })
}

// the featured and popular topic id lists from the database. featured topics keep their feature order,
// and every other shown public topic is popular, ranked by subscriber count, newer breaking a tie
async function loadPublicSectionTopicIds(): Promise<TopicSectionIds> {
	const [featuredTopicIds, popularTopicIds] = await Promise.all([
		db
			.select({ id: topics.id })
			.from(topics)
			.where(and(isPublicAndShown, isNotNull(topics.featureOrder)))
			.orderBy(asc(topics.featureOrder)),
		db
			.select({ id: topics.id })
			.from(topics)
			.where(and(isPublicAndShown, isNull(topics.featureOrder)))
			.orderBy(desc(topics.subscriberCount), desc(topics.createdAt))
			.limit(MAX_POPULAR_TOPIC_IDS),
	])
	return {
		featuredIds: featuredTopicIds.map((topicIdRow) => topicIdRow.id),
		popularIds: popularTopicIds.map((topicIdRow) => topicIdRow.id),
	}
}

// the featured and popular topic rows, rebuilt from the cached id lists
async function publicSectionTopics(userId: string | null): Promise<{
	featuredTopics: (typeof topics.$inferSelect)[]
	popularTopics: (typeof topics.$inferSelect)[]
}> {
	// the cached id lists say which topics the sections show and in what order
	const { featuredIds, popularIds } = await readPublicSectionTopicIds()
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

	// the user's own topics, and the topics they subscribe to but don't own. both read newest first.
	// an unordered select leaves the order to the database, which moves a row after any update to it
	const [ownersTopics, subscribedTopics, { featuredTopics, popularTopics }] = await traceRequestStage(
		"topic_feed.sections",
		() =>
			Promise.all([
				userId
					? db.select().from(topics).where(eq(topics.ownerId, userId)).orderBy(desc(topics.createdAt))
					: Promise.resolve([]),
				// subscribed topics never include one this user owns
				userId && activeSubscriptionTopicIds
					? db
							.select()
							.from(topics)
							.where(and(ne(topics.ownerId, userId), inArray(topics.id, activeSubscriptionTopicIds)))
							.orderBy(desc(topics.createdAt))
					: Promise.resolve([]),
				publicSectionTopics(userId),
			]),
	)

	// fetch every loaded topic's feed data in one batch keyed by topic id, then build each feed in memory
	const combinedTopics = [...ownersTopics, ...subscribedTopics, ...featuredTopics, ...popularTopics]
	const topicFeedData = await traceRequestStage("topic_feed.data", () => loadTopicFeedData(combinedTopics, userId))

	// build each section's feeds from the batched data
	const toTopicFeeds = (sectionTopics: (typeof topics.$inferSelect)[]): TopicFeed[] =>
		sectionTopics.map((topic) => buildTopicFeed(topic, userId, includeConsumedResources, topicFeedData))
	const [ownerTopicFeeds, subscribedTopicFeeds, featuredTopicFeeds, popularTopicFeeds] = traceRequestStage(
		"topic_feed.assemble",
		() =>
			[
				toTopicFeeds(ownersTopics),
				toTopicFeeds(subscribedTopics),
				toTopicFeeds(featuredTopics),
				toTopicFeeds(popularTopics),
			] as const,
	)

	// fill every feed's favicon paths in one query
	await traceRequestStage("topic_feed.favicons", () =>
		attachTopicFindingFaviconPaths(
			[...ownerTopicFeeds, ...subscribedTopicFeeds, ...featuredTopicFeeds, ...popularTopicFeeds].flatMap(
				(topicFeed) => topicFeed.findings,
			),
		),
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
	const isTopicOwner = topic.ownerId === userId
	const ownerRow = feedData.ownerByTopic.get(topic.id)

	// read the sources, dropping the grouping key from each row
	const topicSources = (feedData.sourcesByTopic.get(topic.id) ?? [])
		.filter((source) => source.status === "ready" || isTopicOwner)
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
		failureMessage: null,
	}))

	// shape each row into a topic finding and set its isConsumed flag
	const topicFindings: TopicFinding[] = findingRows.map(toTopicFinding)

	// return the topic feed with its metadata
	return {
		id: topic.id,
		name: topic.name,
		prompt: topic.prompt,
		tags: topic.tags,
		frequency: topic.frequency,
		scheduledTime: toScheduledTimeLabel(topic.scheduledTime),
		scheduledDayOfWeek: topic.scheduledDayOfWeek,
		maxTopicFindings: topic.maxTopicFindings,
		// the topic owner to show
		owner: ownerRow
			? {
					userId: ownerRow.userId,
					username: ownerRow.username,
					avatarSource: ownerRow.avatarSource,
					avatarVersion: toAvatarVersion(ownerRow),
				}
			: null,
		isTopicOwner,
		isOnTeam: topic.teamId !== null,
		teamLink: feedData.teamLinkByTopic.get(topic.id) ?? null,
		isTeamMember: userId !== null && feedData.memberTopicIdSet.has(topic.id),
		chatMentions: feedData.mentionsByTopic.get(topic.id) ?? [],
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
		monthCostDollars: isTopicOwner ? Number(feedData.monthCostByTopic.get(topic.id) ?? 0) : null,
		scanSummary: lastScan?.scanSummary ?? null,
		attachments: topicAttachments,
		sources: topicSources,
		findings: filteredTopicFindings(topicFindings, includeConsumedResources),
		latestPodcastEpisode: feedData.latestPodcastEpisodeByTopic.get(topic.id) ?? null,
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

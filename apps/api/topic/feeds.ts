// the topic feed logic for the homepage route. it batches every topic's data in one pass and builds each feed in memory
import type { visibilities } from "@carlnotes/contracts/enums"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import { toSourceSummary, toSourceValue } from "@carlnotes/contracts/sources"
import type { TopicFeed, TopicFeedResponse, TopicResponse } from "@carlnotes/contracts/topics"
import { db, isPublicAndShown } from "@carlnotes/db"
import { cacheJson, deleteRedisKeys } from "@carlnotes/db/redis"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { traceRequestStage } from "@carlnotes/server/monitoring"
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm"
import { toProfileIdentity } from "../avatars"
import { attachTopicFindingFaviconPaths } from "../favicons"
import { loadTopicFeedData } from "./feedData"
import { filteredTopicFindings, newTopicFindingCount, toTopicFinding } from "./findings"
import { toScanDurationMs, toScheduledTimeLabel } from "./helpers"

// the Redis key every replica reads the featured and popular topic id lists through, and how long they are kept
const TOPIC_SECTION_IDS_KEY = "topic-section-ids"
const TOPIC_SECTION_IDS_TTL_MS = 60_000

// the Redis key prefix the visitors' feed is served through, one key per view, and how long a visitor's cached feed or
// topic page is kept
const VISITOR_TOPIC_FEED_KEY_PREFIX = "topic-feed:visitor"
const VISITOR_CACHE_TTL_MS = 30_000

// the Redis key prefix that a topic page is served through, to visitors and to a poll reload
export const TOPIC_PAGE_KEY_PREFIX = "topic-page"

// how many popular topic ids the homepage keeps, ten pages of its five
const MAX_POPULAR_TOPIC_IDS = 50

// the featured and popular topic id lists
type TopicSectionIds = { featuredIds: string[]; popularIds: string[] }

// a topic's visibility
type TopicVisibility = (typeof visibilities)[number]

// the topic whose cached visitor copies to drop, its visibility after the change, its visibility before the change if
// the change may have set a new one, and whether the change released its feature order
type ClearVisitorTopicCachesOptions = {
	topicId: string
	visibility: TopicVisibility
	previousVisibility?: TopicVisibility
	isFeatureOrderReleased?: boolean
}

// the topic ids this user actively subscribes to
function activeSubscriptionTopicIdQuery(userId: string) {
	return db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(and(eq(subscriptions.isActive, true), eq(subscriptions.subscriberUserId, userId)))
}

/**
 * Deletes the shared topic section id lists and the visitors' feeds, so the next feed build on any replica reads them fresh.
 */
export async function clearSharedTopicFeedCaches(): Promise<void> {
	await deleteRedisKeys(...toSharedTopicFeedKeys())
}

/**
 * Deletes a topic's cached visitor page, and the visitors' feeds if the topic was or is public or featured.
 */
export async function clearVisitorTopicCaches({
	topicId,
	visibility,
	previousVisibility = visibility,
	isFeatureOrderReleased = false,
}: ClearVisitorTopicCachesOptions): Promise<void> {
	// the visitors' feeds list public topics with their sources, so a change to a topic that was or is public drops them
	const isListingChanged = isFeatureOrderReleased || visibility === "public" || previousVisibility === "public"
	await deleteRedisKeys(toVisitorTopicPageKey(topicId), ...(isListingChanged ? toSharedTopicFeedKeys() : []))
}

/**
 * Deletes the topics' cached visitor pages alone, in one delete.
 */
export async function clearVisitorTopicPages(...topicIds: string[]): Promise<void> {
	await deleteRedisKeys(...topicIds.map(toVisitorTopicPageKey))
}

// the shared topic section id lists and both views of the visitors' feed
function toSharedTopicFeedKeys(): string[] {
	return [TOPIC_SECTION_IDS_KEY, toVisitorTopicFeedKey(true), toVisitorTopicFeedKey(false)]
}

/**
 * Returns the Redis key a topic's page is served to visitors through.
 */
export function toVisitorTopicPageKey(topicId: string): string {
	return `${TOPIC_PAGE_KEY_PREFIX}:visitor-page:${topicId}`
}

/**
 * Returns the topic page every signed-out visitor sees, loaded once per half minute across every replica.
 */
export function readVisitorTopicPage(
	topicId: string,
	loadTopicPage: () => Promise<TopicResponse | null>,
): Promise<TopicResponse | null> {
	return cacheJson({ key: toVisitorTopicPageKey(topicId), ttlMs: VISITOR_CACHE_TTL_MS, load: loadTopicPage })
}

/**
 * Returns the feed every signed-out visitor sees, built once per half minute across every replica.
 */
export function readVisitorTopicFeeds(includeConsumedResources: boolean): Promise<Pick<TopicFeedResponse, "sections">> {
	return cacheJson({
		key: toVisitorTopicFeedKey(includeConsumedResources),
		ttlMs: VISITOR_CACHE_TTL_MS,
		load: () => buildTopicFeeds(null, includeConsumedResources),
	})
}

// the visitors' feed key for one view
function toVisitorTopicFeedKey(includeConsumedResources: boolean): string {
	return `${VISITOR_TOPIC_FEED_KEY_PREFIX}:${includeConsumedResources ? "all" : "unread"}`
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
		owner: toProfileIdentity(feedData.ownerByTopic.get(topic.id) ?? null),
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
		viewerCount: topic.viewerCount,
		// the first team to hold a topic owns it in a column, and every later team to add a topic gets a shared-in row
		teamCount: (feedData.sharedTeamCountByTopic.get(topic.id) ?? 0) + (topic.teamId ? 1 : 0),
		visibility: topic.visibility,
		// the created time, the newest shown finding's time or the created time, the last scan details, attachments,
		// sources, and topic findings
		createdAt: topic.createdAt.toISOString(),
		feedUpdatedAt: (findingRows[0]?.newestFindingCreatedAt ?? topic.createdAt).toISOString(),
		lastScanAt: lastScan?.startedAt.toISOString() ?? null,
		lastScanDurationMs: toScanDurationMs(lastScan),
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

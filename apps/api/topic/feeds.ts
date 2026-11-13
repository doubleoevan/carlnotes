// the topic feed logic for the homepage route. it batches every topic's data in one pass and builds each feed in memory

import type { TopicFinding } from "@carlnotes/contracts/findings"
import { EMPTY_REACTION_SUMMARY, toSocialTargetKey } from "@carlnotes/contracts/social"
import { toTopicImageUrlsOrNull } from "@carlnotes/contracts/topicImages"
import type { TopicFeed, TopicFeedResponse, TopicResponse, TopicSectionKey } from "@carlnotes/contracts/topics"
import { db, isPublicAndShown } from "@carlnotes/db"
import { cacheJson } from "@carlnotes/db/redis"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { traceRequestStage } from "@carlnotes/server/monitoring"
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, type SQL } from "drizzle-orm"
import { toProfileIdentity } from "../avatars"
import { attachTopicFindingFaviconPaths } from "../favicons"
import { loadReactionSummaries } from "../social/reactionRows"
import { TOPIC_SECTION_IDS_KEY, toVisitorTopicFeedKey, toVisitorTopicPageKey } from "./feedCaches"
import { loadTopicFeedData } from "./feedData"
import { filteredTopicFindings, newTopicFindingCount, toTopicFinding } from "./findings"
import { toScanDurationMs, toScheduledTimeLabel } from "./helpers"
import { toTopicSourceSummary } from "./topicSourceSummary"

// how long the home and popular topic id lists are kept
const TOPIC_SECTION_IDS_TTL_MS = 60_000

// how long a visitor's cached feed or topic page is kept
const VISITOR_CACHE_TTL_MS = 30_000

// how many popular topic ids the homepage keeps, ten pages of its five
const MAX_POPULAR_TOPIC_IDS = 50

// the home and popular topic id lists
type TopicSectionIds = { homeIds: string[]; popularIds: string[] }

/**
 * Returns the query for the topic ids this user actively subscribes to.
 */
export function activeSubscriptionTopicIdQuery(userId: string) {
	return db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(and(eq(subscriptions.isActive, true), eq(subscriptions.subscriberUserId, userId)))
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

/**
 * Returns the public home and popular topic id lists, read through the shared Redis key for a minute.
 */
export function readPublicSectionTopicIds(): Promise<TopicSectionIds> {
	return cacheJson({ key: TOPIC_SECTION_IDS_KEY, ttlMs: TOPIC_SECTION_IDS_TTL_MS, load: loadPublicSectionTopicIds })
}

// the home and popular topic id lists from the database. home topics keep their home order,
// and every other shown public topic is popular, ranked by subscriber count, newer breaking a tie
async function loadPublicSectionTopicIds(): Promise<TopicSectionIds> {
	const [homeTopicIds, popularTopicIds] = await Promise.all([
		db
			.select({ id: topics.id })
			.from(topics)
			.where(and(isPublicAndShown, isNotNull(topics.homeOrder)))
			.orderBy(asc(topics.homeOrder)),
		db
			.select({ id: topics.id })
			.from(topics)
			.where(and(isPublicAndShown, isNull(topics.homeOrder)))
			.orderBy(desc(topics.subscriberCount), desc(topics.createdAt))
			.limit(MAX_POPULAR_TOPIC_IDS),
	])
	return {
		homeIds: homeTopicIds.map((topicIdRow) => topicIdRow.id),
		popularIds: popularTopicIds.map((topicIdRow) => topicIdRow.id),
	}
}

// the home and popular topic rows, rebuilt from the cached id lists
async function publicSectionTopics(userId: string | null): Promise<{
	homeTopics: (typeof topics.$inferSelect)[]
	popularTopics: (typeof topics.$inferSelect)[]
}> {
	// the cached id lists say which topics the sections show and in what order
	const { homeIds, popularIds } = await readPublicSectionTopicIds()
	const sectionIds = [...homeIds, ...popularIds]
	if (sectionIds.length === 0) {
		return { homeTopics: [], popularTopics: [] }
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
	return { homeTopics: toTopics(homeIds), popularTopics: toTopics(popularIds) }
}

/**
 * Returns one section's topic ids in the feed's order, without building the section's feeds. A visitor has no own or
 * followed topics.
 */
export async function loadTopicSectionIds(userId: string | null, sectionKey: TopicSectionKey): Promise<string[]> {
	// the own and followed sections, newest first
	if (sectionKey === "yours" || sectionKey === "subscribed") {
		if (!userId) {
			return []
		}
		// the section's own filter, the same one its feed reads
		const sectionFilter = sectionKey === "yours" ? eq(topics.ownerId, userId) : toSubscribedSectionFilter(userId)
		const topicIdRows = await db
			.select({ id: topics.id })
			.from(topics)
			.where(sectionFilter)
			.orderBy(desc(topics.createdAt))
		return topicIdRows.map((topicIdRow) => topicIdRow.id)
	}

	// the public sections, with their visibility checked again
	const { homeTopics, popularTopics } = await publicSectionTopics(userId)
	return (sectionKey === "home" ? homeTopics : popularTopics).map((topic) => topic.id)
}

// the topics a user actively follows, less the ones they own
function toSubscribedSectionFilter(userId: string): SQL | undefined {
	return and(ne(topics.ownerId, userId), inArray(topics.id, activeSubscriptionTopicIdQuery(userId)))
}

/**
 * Build a topic feed's sections: home and popular for everyone, yours and subscribed as well for a logged-in user.
 */
export async function buildTopicFeeds(
	userId: string | null,
	includeConsumedResources: boolean,
): Promise<Pick<TopicFeedResponse, "sections">> {
	// the user's own topics, and the topics they subscribe to but don't own. both read newest first.
	// an unordered select leaves the order to the database, which moves a row after any update to it
	const [ownersTopics, subscribedTopics, { homeTopics, popularTopics }] = await traceRequestStage(
		"topic_feed.sections",
		() =>
			Promise.all([
				userId
					? db.select().from(topics).where(eq(topics.ownerId, userId)).orderBy(desc(topics.createdAt))
					: Promise.resolve([]),
				// subscribed topics never include one this user owns
				userId
					? db.select().from(topics).where(toSubscribedSectionFilter(userId)).orderBy(desc(topics.createdAt))
					: Promise.resolve([]),
				publicSectionTopics(userId),
			]),
	)

	// fetch every loaded topic's feed data in one batch keyed by topic id, then build each feed in memory
	const combinedTopics = [...ownersTopics, ...subscribedTopics, ...homeTopics, ...popularTopics]
	const topicFeedData = await traceRequestStage("topic_feed.data", () => loadTopicFeedData(combinedTopics, userId))

	// build each section's feeds from the batched data
	const toTopicFeeds = (sectionTopics: (typeof topics.$inferSelect)[]): TopicFeed[] =>
		sectionTopics.map((topic) => buildTopicFeed(topic, userId, includeConsumedResources, topicFeedData))
	const [ownerTopicFeeds, subscribedTopicFeeds, homeTopicFeeds, popularTopicFeeds] = traceRequestStage(
		"topic_feed.assemble",
		() =>
			[
				toTopicFeeds(ownersTopics),
				toTopicFeeds(subscribedTopics),
				toTopicFeeds(homeTopics),
				toTopicFeeds(popularTopics),
			] as const,
	)

	// fill every feed's favicon paths in one query, and every topic's own reactions in one read
	const allTopicFeeds = [...ownerTopicFeeds, ...subscribedTopicFeeds, ...homeTopicFeeds, ...popularTopicFeeds]
	const [, reactionSummaries] = await Promise.all([
		traceRequestStage("topic_feed.favicons", () =>
			attachTopicFindingFaviconPaths(allTopicFeeds.flatMap((topicFeed) => topicFeed.findings)),
		),
		traceRequestStage("topic_feed.reactions", () =>
			loadReactionSummaries({
				userId,
				targets: allTopicFeeds.map((topicFeed) => ({ kind: "topic" as const, id: topicFeed.id })),
			}),
		),
	])
	for (const topicFeed of allTopicFeeds) {
		topicFeed.reactions =
			reactionSummaries.get(toSocialTargetKey({ kind: "topic", id: topicFeed.id })) ?? EMPTY_REACTION_SUMMARY
	}

	// only show "yours" and "subscribed" sections to a signed-in visitor
	const sections: TopicFeedResponse["sections"] = userId
		? [
				{ key: "yours", topics: ownerTopicFeeds },
				{ key: "subscribed", topics: subscribedTopicFeeds },
			]
		: []
	sections.push({ key: "home", topics: homeTopicFeeds }, { key: "popular", topics: popularTopicFeeds })
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
		.flatMap(toTopicSourceSummary)

	// read the attachments, dropping the grouping key from each row
	const topicAttachments = toFeedAttachments(feedData.attachmentsByTopic.get(topic.id) ?? [])

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
		...toFeedTeamFields(topic, userId, feedData),
		chatMentions: feedData.mentionsByTopic.get(topic.id) ?? [],
		// what this user may do with the topic, plus their unconsumed topic findings count
		canRate: canRateInFeed(topic, userId, feedData.subscribedTopicIdSet, feedData.memberTopicIdSet),
		isSubscribed: feedData.subscribedTopicIdSet.has(topic.id),
		newCount: newTopicFindingCount(topicFindings),
		subscriberCount,
		viewerCount: topic.viewerCount,
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
		image: toTopicImageUrlsOrNull(topic.id, topic.imageHash),
	}
}

// a topic's team fields in the feed: whether a team owns it, the team link, the user's membership, and the team count
function toFeedTeamFields(
	topic: typeof topics.$inferSelect,
	userId: string | null,
	feedData: Awaited<ReturnType<typeof loadTopicFeedData>>,
): Pick<TopicFeed, "isOnTeam" | "teamLink" | "isTeamMember" | "teamCount"> {
	// the first team to hold a topic owns it in a column, and every later team to add a topic gets a shared-in row
	return {
		isOnTeam: topic.teamId !== null,
		teamLink: feedData.teamLinkByTopic.get(topic.id) ?? null,
		isTeamMember: userId !== null && feedData.memberTopicIdSet.has(topic.id),
		teamCount: (feedData.sharedTeamCountByTopic.get(topic.id) ?? 0) + (topic.teamId ? 1 : 0),
	}
}

// an attachment row as the feed shows it, with no context and no failure message, which only the topic page shows
function toFeedAttachments(
	attachmentRows: NonNullable<ReturnType<Awaited<ReturnType<typeof loadTopicFeedData>>["attachmentsByTopic"]["get"]>>,
): TopicFeed["attachments"] {
	return attachmentRows.map((attachment) => ({
		id: attachment.id,
		filename: attachment.filename,
		sourceUrl: attachment.sourceUrl,
		status: attachment.status,
		context: null,
		failureMessage: null,
	}))
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

// the podcast episode row reads: a topic's published episodes, one episode by its id or by its season and number, and
// the view rules and the subscription activation gate that limit each read to what the user may listen to

import { db, isPublicAndShown } from "@carlnotes/db"
import { toTopicRoleFilter } from "@carlnotes/db/contentFilters"
import { loadUserAccess } from "@carlnotes/db/quotas"
import { memoizeRowsById } from "@carlnotes/db/requestMemo"
import { podcastEpisodeListens, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { scans } from "@carlnotes/db/schema/scans"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { topicSubscriptionStartDate } from "@carlnotes/db/topicPermissions"
import { isAfterSubscriberActivation } from "@carlnotes/db/topicSubscriptions"
import { isPodcastEpisodeRecordingConfigured } from "@carlnotes/server/podcastEpisodeSettings"
import { and, desc, eq, exists, gt, inArray, ne, or, type SQL, sql } from "drizzle-orm"
import { isAllowed } from "../authorization"
import { lastScanSummary, shownFindingCount } from "../seo"

// a podcast episode's columns, without its script
export const podcastEpisodeColumns = {
	id: podcastEpisodes.id,
	topicId: podcastEpisodes.topicId,
	scanId: podcastEpisodes.scanId,
	status: podcastEpisodes.status,
	title: podcastEpisodes.title,
	description: podcastEpisodes.description,
	// assigned on publish
	season: podcastEpisodes.season,
	episodeNumber: podcastEpisodes.episodeNumber,
	audioKey: podcastEpisodes.audioKey,
	audioByteSize: podcastEpisodes.audioByteSize,
	durationSeconds: podcastEpisodes.durationSeconds,
	// the unique people who played or downloaded the podcast episode
	listenerCount: podcastEpisodes.listenerCount,
	publishedAt: podcastEpisodes.publishedAt,
	// the content hash of the podcast episode's own image
	imageHash: podcastEpisodes.imageHash,
}

// a podcast episode row with the columns above, and a topic row
export type PodcastEpisodeRow = Pick<typeof podcastEpisodes.$inferSelect, keyof typeof podcastEpisodeColumns>
export type TopicRow = typeof topics.$inferSelect

// a user's saved progress through one podcast episode, and when the user finished it
export type PodcastEpisodeListenRow = Pick<
	typeof podcastEpisodeListens.$inferSelect,
	"podcastEpisodeId" | "progressSeconds" | "completedAt"
>

// the topic fields that a podcast episode's page path is built from
export type PodcastEpisodeTopic = Pick<TopicRow, "id" | "name" | "visibility" | "imageHash">

// a podcast episode's row and its topic, for a user who may listen to the episode, and when the user's subscription
// activated if a gate applies
export type AccessiblePodcastEpisode = {
	podcastEpisodeRow: PodcastEpisodeRow
	topic: TopicRow
	subscriberActivatedAt?: Date
}

/**
 * Returns the properties every play and finish reports about a podcast episode and its topic.
 */
export function toPodcastEpisodeAnalyticsProperties(
	topic: Pick<TopicRow, "id" | "visibility">,
	podcastEpisodeId: string,
): { topicId: string; isTopicPublic: boolean; episodeId: string } {
	return { topicId: topic.id, isTopicPublic: topic.visibility === "public", episodeId: podcastEpisodeId }
}

// the user, null for a visitor, and the podcast episode to load
type LoadAccessiblePodcastEpisodeOptions = { userId: string | null; podcastEpisodeId: string }

/**
 * Loads a podcast episode's row and its topic if the user may listen to the episode, or null.
 */
export async function loadAccessiblePodcastEpisode({
	userId,
	podcastEpisodeId,
}: LoadAccessiblePodcastEpisodeOptions): Promise<AccessiblePodcastEpisode | null> {
	if (!isPodcastEpisodeRecordingConfigured()) {
		return null
	}

	// the podcast episode with its topic and when its scan started.
	// an episode whose topic was deleted has no topic to join
	const [podcastEpisodeTopicRow] = await db
		.select({ podcastEpisodeRow: podcastEpisodeColumns, topic: topics, scanStartedAt: scans.startedAt })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.leftJoin(scans, eq(podcastEpisodes.scanId, scans.id))
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	return podcastEpisodeTopicRow ? toAccessiblePodcastEpisode(podcastEpisodeTopicRow, userId) : null
}

// a podcast episode's row with its topic and when its scan started, which an access check reads
type PodcastEpisodeTopicRow = { podcastEpisodeRow: PodcastEpisodeRow; topic: TopicRow; scanStartedAt: Date | null }

/**
 * Returns a podcast episode read with its topic as the user may listen to it, or null for a removed podcast episode, a
 * podcast episode on a topic that the user cannot see, and one published or scanned before the user's subscription activated.
 */
export async function toAccessiblePodcastEpisode(
	{ podcastEpisodeRow, topic, scanStartedAt }: PodcastEpisodeTopicRow,
	userId: string | null,
): Promise<AccessiblePodcastEpisode | null> {
	// a removed podcast episode, and a podcast episode on a topic that the user cannot see
	if (podcastEpisodeRow.status === "removed" || !(await isAllowed(userId, "topic:view", topic))) {
		return null
	}

	// gate the podcast episode on the user's subscription activation by its publish time,
	// or by its scan's start if the podcast episode has not published
	const subscriberActivatedAt = await loadSubscriberActivatedAt(topic, userId)
	if (!isAfterSubscriberActivation(podcastEpisodeRow.publishedAt ?? scanStartedAt, subscriberActivatedAt)) {
		return null
	}
	return { podcastEpisodeRow, topic, subscriberActivatedAt: subscriberActivatedAt ?? undefined }
}

/**
 * Returns the podcast episode view rules in SQL, over the episode joined with its topic. A visitor sees a public shown
 * topic's episodes, checked by the public shown rule passed in, and a user also sees the episodes
 * toPodcastEpisodeAccessFilter allows.
 */
export function toPodcastEpisodeViewFilter(
	userId: string | null,
	publicAndShownFilter: SQL | undefined = isPublicAndShown,
): SQL | undefined {
	return userId ? or(toPodcastEpisodeAccessFilter(userId), publicAndShownFilter) : publicAndShownFilter
}

/**
 * Returns the podcast episodes a user may listen to through their account in SQL, over the episode joined with its
 * topic: a topic's episodes if they have a role on it, and an invite topic's episodes published after their
 * subscription to it activated.
 */
export function toPodcastEpisodeAccessFilter(userId: string): SQL | undefined {
	// an active subscription of the user's to the episode's topic that activated before the episode published
	const subscriptionBeforePublishQuery = db
		.select({ id: subscriptions.id })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.topicId, topics.id),
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
				gt(podcastEpisodes.publishedAt, subscriptions.createdAt),
			),
		)

	// a topic the user has a role on, or an invite topic subscribed to before the episode published
	return or(toTopicRoleFilter(userId), and(eq(topics.visibility, "invite"), exists(subscriptionBeforePublishQuery)))
}

// the topic, the season, and the episode number within the season that name a podcast episode page
export type PodcastEpisodePageRef = { topicId: string; season: number; episodeNumber: number }

// what a podcast episode's page reads in one row beside the published podcast episode and its topic: its script, home
// order, and image fields, when its scan started, its topic owner's identity, and what the page's head reads of its
// topic, the last scan summary and the shown finding count
const podcastEpisodePageRowColumns = {
	podcastEpisodeRow: podcastEpisodeColumns,
	podcastEpisodePageFields: {
		script: podcastEpisodes.script,
		homeOrder: podcastEpisodes.homeOrder,
		imageOrigin: podcastEpisodes.imageOrigin,
		imagePrompt: podcastEpisodes.imagePrompt,
	},
	topic: topics,
	scanStartedAt: scans.startedAt,
	owner: {
		userId: users.id,
		username: users.username,
		avatarSource: users.avatarSource,
		avatarKey: users.avatarKey,
		image: users.image,
	},
	topicHeadFields: { scanSummary: lastScanSummary, keptCount: shownFindingCount },
}

// the published podcast episode at a page's address, with everything its page and its head read in the same row
export type PodcastEpisodePageRow = {
	podcastEpisodeRow: PodcastEpisodeRow
	podcastEpisodePageFields: Pick<
		typeof podcastEpisodes.$inferSelect,
		"script" | "homeOrder" | "imageOrigin" | "imagePrompt"
	>
	topic: TopicRow
	scanStartedAt: Date | null
	owner: Pick<typeof users.$inferSelect, "username" | "avatarSource" | "avatarKey" | "image"> & { userId: string }
	topicHeadFields: { scanSummary: string | null; keptCount: number }
}

/**
 * Loads the published podcast episode at a season and episode number with its topic of any visibility, its page's
 * fields, its topic's owner, and its head's topic fields, in one read once a request that only reads, or null.
 */
export async function loadPodcastEpisodePageRow({
	topicId,
	season,
	episodeNumber,
}: PodcastEpisodePageRef): Promise<PodcastEpisodePageRow | null> {
	// the published podcast episode of the topic at the season and episode number
	const pageRef = `${topicId}:${season}:${episodeNumber}`
	const podcastEpisodePageRowByPageRef = await memoizeRowsById("podcast-episode-page-rows", [pageRef], async () => {
		// the podcast episode joined to its topic, its topic's owner, and its scan
		const [podcastEpisodePageRow] = await db
			.select(podcastEpisodePageRowColumns)
			.from(podcastEpisodes)
			.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
			.innerJoin(users, eq(users.id, topics.ownerId))
			.leftJoin(scans, eq(podcastEpisodes.scanId, scans.id))
			.where(
				and(
					eq(podcastEpisodes.topicId, topicId),
					eq(podcastEpisodes.season, season),
					eq(podcastEpisodes.episodeNumber, episodeNumber),
					eq(podcastEpisodes.status, "published"),
				),
			)
		return new Map(podcastEpisodePageRow ? [[pageRef, podcastEpisodePageRow]] : [])
	})
	const podcastEpisodePageRow = podcastEpisodePageRowByPageRef.get(pageRef)
	return isPodcastEpisodeRecordingConfigured() && podcastEpisodePageRow ? podcastEpisodePageRow : null
}

/**
 * Loads a published podcast episode by its id, with its topic of any visibility, or null.
 */
export async function loadPublishedPodcastEpisodeById(
	podcastEpisodeId: string,
): Promise<{ podcastEpisodeRow: PodcastEpisodeRow; topic: TopicRow } | null> {
	// the published podcast episode with that id, with its topic
	const [publishedPodcastEpisode] = await db
		.select({ podcastEpisodeRow: podcastEpisodeColumns, topic: topics })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(and(eq(podcastEpisodes.id, podcastEpisodeId), eq(podcastEpisodes.status, "published")))
	return isPodcastEpisodeRecordingConfigured() && publishedPodcastEpisode ? publishedPodcastEpisode : null
}

/**
 * Loads a topic's published podcast episodes that the user may listen to, newest first.
 */
export async function loadPublishedPodcastEpisodeRows(
	topic: TopicRow,
	userId: string | null,
): Promise<PodcastEpisodeRow[]> {
	// return no podcast episodes if episode recording is not configured,
	// or if the user has no active subscription to an invite topic
	const subscriberActivatedAt = isPodcastEpisodeRecordingConfigured()
		? await loadSubscriberActivatedAt(topic, userId)
		: null
	if (subscriberActivatedAt === null) {
		return []
	}

	// the activation gate keeps only the podcast episodes published after the user's subscription activated, read once
	// for the user in a request that only reads. ponytail: reads every published podcast episode of the topic. page the
	// read in sql if a topic's podcast episodes reach the thousands
	const podcastEpisodeRowsByTopicId = await memoizeRowsById(
		`published-podcast-episodes:${userId ?? ""}`,
		[topic.id],
		async () => {
			const podcastEpisodeRows = await db
				.select(podcastEpisodeColumns)
				.from(podcastEpisodes)
				.where(toListenableTopicPodcastEpisodeFilter({ topicId: topic.id, subscriberActivatedAt }))
				.orderBy(desc(podcastEpisodes.publishedAt))
			return new Map([[topic.id, podcastEpisodeRows]])
		},
	)
	return podcastEpisodeRowsByTopicId.get(topic.id) ?? []
}

/**
 * Returns the filter of a topic's podcast episodes that were not removed, whose newest by creation is the topic's
 * newest podcast episode of any status.
 */
export function toNewestPodcastEpisodeFilter(topicId: string): SQL | undefined {
	return and(eq(podcastEpisodes.topicId, topicId), ne(podcastEpisodes.status, "removed"))
}

/**
 * A topic's published podcast episodes that the user may listen to, newest first, and its newest podcast episode that
 * was not removed, of any status.
 */
export type PublishedAndNewestPodcastEpisodeRows = {
	publishedPodcastEpisodeRows: PodcastEpisodeRow[]
	newestPodcastEpisodeRow: PodcastEpisodeRow | undefined
}

/**
 * Loads a topic's published podcast episodes that the user may listen to, newest first, and its newest podcast episode
 * that was not removed, in one read.
 */
export async function loadPublishedAndNewestPodcastEpisodeRows(
	topic: TopicRow,
	userId: string | null,
): Promise<PublishedAndNewestPodcastEpisodeRows> {
	// the published podcast episodes that the user may listen to, none for an invite topic's reader with no active
	// subscription
	const subscriberActivatedAt = await loadSubscriberActivatedAt(topic, userId)
	const listenableFilter =
		subscriberActivatedAt === null
			? sql`false`
			: (toListenableTopicPodcastEpisodeFilter({ topicId: topic.id, subscriberActivatedAt }) ?? sql`true`)

	// the newest podcast episode that was not removed, of any status
	const newestPodcastEpisodeIdQuery = db
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(toNewestPodcastEpisodeFilter(topic.id))
		.orderBy(desc(podcastEpisodes.createdAt))
		.limit(1)
	const isNewestPodcastEpisode = inArray(podcastEpisodes.id, newestPodcastEpisodeIdQuery)

	// both kinds of row in one read of the topic's podcast episodes, each marked with the kind it is
	const podcastEpisodeRows = await db
		.select({
			podcastEpisodeRow: podcastEpisodeColumns,
			isListenable: sql<boolean>`${listenableFilter}`,
			isNewest: sql<boolean>`${isNewestPodcastEpisode}`,
		})
		.from(podcastEpisodes)
		.where(and(eq(podcastEpisodes.topicId, topic.id), or(listenableFilter, isNewestPodcastEpisode)))
		.orderBy(desc(podcastEpisodes.publishedAt))
	return {
		publishedPodcastEpisodeRows: podcastEpisodeRows.flatMap((row) => (row.isListenable ? row.podcastEpisodeRow : [])),
		newestPodcastEpisodeRow: podcastEpisodeRows.find((row) => row.isNewest)?.podcastEpisodeRow,
	}
}

// the topic, and when the user's subscription activated if a gate applies
type ToListenableTopicPodcastEpisodeFilterOptions = { topicId: string; subscriberActivatedAt?: Date }

/**
 * Returns the condition that a podcast episode is one of the topic's published episodes that the user may listen to:
 * published after their subscription activated, if a gate applies.
 */
export function toListenableTopicPodcastEpisodeFilter({
	topicId,
	subscriberActivatedAt,
}: ToListenableTopicPodcastEpisodeFilterOptions): SQL | undefined {
	return and(
		eq(podcastEpisodes.topicId, topicId),
		eq(podcastEpisodes.status, "published"),
		subscriberActivatedAt ? gt(podcastEpisodes.publishedAt, subscriberActivatedAt) : undefined,
	)
}

// when the user's subscription to an invite topic activated, null if the user has no active subscription,
// or undefined if no activation gate applies to the user
async function loadSubscriberActivatedAt(topic: TopicRow, userId: string | null): Promise<Date | null | undefined> {
	const { isAdmin } = userId ? await loadUserAccess(userId) : { isAdmin: false }
	return topicSubscriptionStartDate(topic, userId, isAdmin)
}

/**
 * Loads the user's progress through the given podcast episodes. A visitor has none.
 */
export async function loadPodcastEpisodeListenRows(
	userId: string | null,
	podcastEpisodeIds: string[],
): Promise<PodcastEpisodeListenRow[]> {
	if (!userId || podcastEpisodeIds.length === 0) {
		return []
	}
	return db
		.select({
			podcastEpisodeId: podcastEpisodeListens.podcastEpisodeId,
			progressSeconds: podcastEpisodeListens.progressSeconds,
			completedAt: podcastEpisodeListens.completedAt,
		})
		.from(podcastEpisodeListens)
		.where(
			and(eq(podcastEpisodeListens.userId, userId), inArray(podcastEpisodeListens.podcastEpisodeId, podcastEpisodeIds)),
		)
}

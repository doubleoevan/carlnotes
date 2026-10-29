// a listener's progress through a podcast episode, and the next podcast episode the listener has not played

import type { PodcastEpisodeListenPayload } from "@carlnotes/contracts/payloads"
import { db } from "@carlnotes/db"
import { loadUserAccess } from "@carlnotes/db/quotas"
import { podcastEpisodeListens, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, desc, eq, exists, isNull, ne, or, sql } from "drizzle-orm"
import { countPodcastEpisodeListen } from "../counts/viewerCounts"
import type { AnalyticsProperties } from "../currentUser"
import {
	type AccessiblePodcastEpisode,
	loadAccessiblePodcastEpisode,
	toPodcastEpisodeViewFilter,
} from "./podcastEpisodeRows"

// what a listener's player reported, with the listener, the podcast episode and its topic, and the request's
// analytics properties
type SavePodcastEpisodeListenOptions = PodcastEpisodeListenPayload & {
	userId: string
	podcastEpisodeId: string
	topic: Pick<typeof topics.$inferSelect, "id" | "visibility">
	analyticsProperties: AnalyticsProperties
}

// the user, and the topic that the user is on
type LoadNextUnplayedPodcastEpisodeOptions = { userId: string; currentTopicId?: string }

/**
 * Saves a listener's progress through a podcast episode, a play if playback started, and whether the listener finished.
 */
export async function savePodcastEpisodeListen({
	userId,
	podcastEpisodeId,
	topic,
	analyticsProperties,
	progressSeconds,
	isPlaybackStart,
	isCompleted,
}: SavePodcastEpisodeListenOptions): Promise<void> {
	// count one play if playback started, and set the completion time only if the listener finished
	const startedPlayCount = isPlaybackStart ? 1 : 0
	const completedFields = isCompleted ? { completedAt: new Date() } : {}

	// insert the listener's row for the podcast episode, or update that row
	await db
		.insert(podcastEpisodeListens)
		.values({ podcastEpisodeId, userId, progressSeconds, playCount: startedPlayCount, ...completedFields })
		.onConflictDoUpdate({
			target: [podcastEpisodeListens.podcastEpisodeId, podcastEpisodeListens.userId],
			set: {
				progressSeconds,
				playCount: sql`${podcastEpisodeListens.playCount} + ${startedPlayCount}`,
				...completedFields,
			},
		})

	// count the user among the podcast episode's listeners if playback started
	if (isPlaybackStart) {
		void countPodcastEpisodeListen({ userId, clientAddress: null, userAgent: null }, podcastEpisodeId)
	}

	// report a playback start and a completion
	const listenProperties = {
		...analyticsProperties,
		topicId: topic.id,
		isTopicPublic: topic.visibility === "public",
		episodeId: podcastEpisodeId,
	}
	if (isPlaybackStart) {
		trackEvent("episode_played", userId, listenProperties)
	}
	if (isCompleted) {
		trackEvent("episode_completed", userId, listenProperties)
	}
}

/**
 * Loads the newest unplayed podcast episode among the latest episodes of the user's other topics, with its topic,
 * or null.
 */
export async function loadNextUnplayedPodcastEpisode({
	userId,
	currentTopicId,
}: LoadNextUnplayedPodcastEpisodeOptions): Promise<AccessiblePodcastEpisode | null> {
	// select the latest published episode per followed or owned Topic before applying listen eligibility
	const activeSubscription = db
		.select({ id: subscriptions.id })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.topicId, topics.id),
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
			),
		)
	const latestPodcastEpisodes = db
		.selectDistinctOn([podcastEpisodes.topicId], { id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(
			and(
				eq(podcastEpisodes.status, "published"),
				currentTopicId ? ne(topics.id, currentTopicId) : undefined,
				or(eq(topics.ownerId, userId), exists(activeSubscription)),
			),
		)
		.orderBy(podcastEpisodes.topicId, desc(podcastEpisodes.publishedAt))
		.as("latest_podcast_episodes")

	// filter inaccessible and already-played episodes in SQL instead of querying each candidate
	const { isAdmin } = await loadUserAccess(userId)
	const [nextPodcastEpisodeRow] = await db
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.innerJoin(latestPodcastEpisodes, eq(latestPodcastEpisodes.id, podcastEpisodes.id))
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.leftJoin(
			podcastEpisodeListens,
			and(eq(podcastEpisodeListens.podcastEpisodeId, podcastEpisodes.id), eq(podcastEpisodeListens.userId, userId)),
		)
		.where(
			and(
				isNull(podcastEpisodeListens.id),
				isAdmin ? undefined : toPodcastEpisodeViewFilter(userId, eq(topics.visibility, "public")),
			),
		)
		.orderBy(desc(podcastEpisodes.publishedAt))
		.limit(1)
	return nextPodcastEpisodeRow
		? loadAccessiblePodcastEpisode({ userId, podcastEpisodeId: nextPodcastEpisodeRow.id })
		: null
}

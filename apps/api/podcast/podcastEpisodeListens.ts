// a listener's progress through a podcast episode, and the next podcast episode the listener has not played

import type { PodcastEpisodeListenPayload } from "@carlnotes/contracts/payloads"
import { db } from "@carlnotes/db"
import { podcastEpisodeListens, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, desc, eq, inArray, or, sql } from "drizzle-orm"
import { countPodcastEpisodeListen } from "../counts/viewerCounts"
import type { AnalyticsProperties } from "../currentUser"
import { type AccessiblePodcastEpisode, loadAccessiblePodcastEpisode } from "./podcastEpisodeRows"

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
	// the topics that the user owns or subscribes to
	const userTopicRows = await db
		.selectDistinct({ id: topics.id })
		.from(topics)
		.leftJoin(subscriptions, and(eq(subscriptions.topicId, topics.id), eq(subscriptions.isActive, true)))
		.where(or(eq(topics.ownerId, userId), eq(subscriptions.subscriberUserId, userId)))

	// leave out the topic that the user is on, and stop if no other topic is left
	const otherTopicIds = userTopicRows.flatMap((userTopicRow) =>
		userTopicRow.id === currentTopicId ? [] : userTopicRow.id,
	)
	if (otherTopicIds.length === 0) {
		return null
	}

	// load each other topic's latest published podcast episode, and sort the episodes newest first
	const latestPodcastEpisodeRows = await db
		.selectDistinctOn([podcastEpisodes.topicId], { id: podcastEpisodes.id, publishedAt: podcastEpisodes.publishedAt })
		.from(podcastEpisodes)
		.where(and(inArray(podcastEpisodes.topicId, otherTopicIds), eq(podcastEpisodes.status, "published")))
		.orderBy(podcastEpisodes.topicId, desc(podcastEpisodes.publishedAt))
	const newestFirstPodcastEpisodeRows = latestPodcastEpisodeRows.toSorted(
		(first, second) => (second.publishedAt?.getTime() ?? 0) - (first.publishedAt?.getTime() ?? 0),
	)

	// the latest podcast episodes that the user already played
	const podcastEpisodeListenRows = await db
		.select({ podcastEpisodeId: podcastEpisodeListens.podcastEpisodeId })
		.from(podcastEpisodeListens)
		.where(
			and(
				eq(podcastEpisodeListens.userId, userId),
				inArray(
					podcastEpisodeListens.podcastEpisodeId,
					latestPodcastEpisodeRows.map(({ id }) => id),
				),
			),
		)
	const playedPodcastEpisodeIds = new Set(
		podcastEpisodeListenRows.map((podcastEpisodeListenRow) => podcastEpisodeListenRow.podcastEpisodeId),
	)

	// return the first podcast episode that the user has not played and may listen to
	for (const { id } of newestFirstPodcastEpisodeRows) {
		const accessiblePodcastEpisode = playedPodcastEpisodeIds.has(id)
			? null
			: await loadAccessiblePodcastEpisode({ userId, podcastEpisodeId: id })
		if (accessiblePodcastEpisode) {
			return accessiblePodcastEpisode
		}
	}

	// return null if the user has no unplayed podcast episode to listen to
	return null
}

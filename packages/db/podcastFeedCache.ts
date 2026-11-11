// the Redis keys that a topic's rendered podcast feeds and film feeds are cached under, and deleting a topic's cached
// feeds
import { type PodcastEpisodeFormat, podcastEpisodeFormats } from "@carlnotes/contracts/podcast"
import { eq } from "drizzle-orm"
import { db } from "./index"
import { deleteRedisKeys } from "./redis"
import { podcastFeedTokens } from "./schema/podcast"

// a topic, the listener whose own feed it is, or null for the public feed, and the feed's format, audio by default
type ToPodcastFeedCacheKeyOptions = { topicId: string; listenerUserId: string | null; format?: PodcastEpisodeFormat }

/**
 * Returns the Redis key that a topic's rendered podcast feed or film feed is cached under, for the public feed or a
 * listener's own.
 */
export function toPodcastFeedCacheKey({
	topicId,
	listenerUserId,
	format = "audio",
}: ToPodcastFeedCacheKeyOptions): string {
	const feedName = format === "video" ? "podcast-video-feed" : "podcast-feed"
	return `${feedName}:${topicId}:${listenerUserId ?? "public"}`
}

/**
 * Deletes every cached podcast feed and film feed of a topic, the public feeds and each listener's feeds.
 */
export async function deletePodcastFeedCache(topicId: string): Promise<void> {
	// delete the public feeds' keys and the keys of each listener who has a feed token for the topic, in both formats
	const podcastFeedTokenRows = await db
		.select({ userId: podcastFeedTokens.userId })
		.from(podcastFeedTokens)
		.where(eq(podcastFeedTokens.topicId, topicId))
	const listenerUserIds = [null, ...podcastFeedTokenRows.map((podcastFeedTokenRow) => podcastFeedTokenRow.userId)]
	const podcastFeedCacheKeys = listenerUserIds.flatMap((listenerUserId) =>
		podcastEpisodeFormats.map((format) => toPodcastFeedCacheKey({ topicId, listenerUserId, format })),
	)
	await deleteRedisKeys(...podcastFeedCacheKeys)
}

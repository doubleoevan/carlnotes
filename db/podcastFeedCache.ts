// the Redis keys that a topic's rendered podcast feeds are cached under, and deleting a topic's cached feeds
import { eq } from "drizzle-orm"
import { db } from "./index"
import { deleteRedisKey } from "./redis"
import { podcastFeedTokens } from "./schema"

// a topic, and the listener whose own feed it is, or null for the public feed
type ToPodcastFeedCacheKeyOptions = { topicId: string; listenerUserId: string | null }

/**
 * Returns the Redis key that a topic's rendered podcast feed is cached under, for the public feed or a listener's own.
 */
export function toPodcastFeedCacheKey({ topicId, listenerUserId }: ToPodcastFeedCacheKeyOptions): string {
	return `podcast-feed:${topicId}:${listenerUserId ?? "public"}`
}

/**
 * Deletes every cached podcast feed of a topic, the public feed and each listener's feed.
 */
export async function deletePodcastFeedCache(topicId: string): Promise<void> {
	// delete the public feed's key and the key of each listener who has a feed token for the topic
	const podcastFeedTokenRows = await db
		.select({ userId: podcastFeedTokens.userId })
		.from(podcastFeedTokens)
		.where(eq(podcastFeedTokens.topicId, topicId))
	const listenerUserIds = [null, ...podcastFeedTokenRows.map((podcastFeedTokenRow) => podcastFeedTokenRow.userId)]
	await Promise.all(
		listenerUserIds.map((listenerUserId) => deleteRedisKey(toPodcastFeedCacheKey({ topicId, listenerUserId }))),
	)
}

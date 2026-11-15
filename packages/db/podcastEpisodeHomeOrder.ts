// a podcast episode's and its film's home order on the home page: the release that closes the gap each leaves, for
// one podcast episode, for the films of some podcast episodes, and for every podcast episode and film of a topic

import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { releaseHomeOrder, releaseTopicHomeOrders } from "./homeOrder"
import { type DbHandle, db } from "./index"
import { podcastEpisodes, topicVideos } from "./schema/podcast"

/**
 * Clears a podcast episode's home order and moves everything below it up one. Returns whether it had one.
 */
export async function releasePodcastEpisodeHomeOrder(
	podcastEpisodeId: string,
	handle: DbHandle = db,
): Promise<boolean> {
	return releaseHomeOrder({ table: podcastEpisodes, id: podcastEpisodeId, handle })
}

/**
 * Clears the home order of the films of the given podcast episodes, one at a time so the orders stay contiguous.
 * Returns whether any had one.
 */
export async function releaseTopicVideoHomeOrders(
	podcastEpisodeIds: string[],
	handle: DbHandle = db,
): Promise<boolean> {
	// the featured films of those podcast episodes
	const homeOrderRows = await handle
		.select({ id: topicVideos.id })
		.from(topicVideos)
		.where(and(inArray(topicVideos.podcastEpisodeId, podcastEpisodeIds), isNotNull(topicVideos.homeOrder)))

	// release each in turn
	for (const homeOrderRow of homeOrderRows) {
		await releaseHomeOrder({ table: topicVideos, id: homeOrderRow.id, handle })
	}
	return homeOrderRows.length > 0
}

/**
 * Clears the home order of every podcast episode of a topic and of their films, one at a time so the orders stay
 * contiguous. Returns whether any had one.
 */
export async function releaseTopicPodcastEpisodeHomeOrders(topicId: string, handle: DbHandle = db): Promise<boolean> {
	// release the topic's featured podcast episodes
	const isPodcastEpisodeOrderReleased = await releaseTopicHomeOrders({ table: podcastEpisodes, topicId, handle })

	// then the films of every podcast episode of the topic
	const podcastEpisodeRows = await handle
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.topicId, topicId))
	const isTopicVideoOrderReleased = await releaseTopicVideoHomeOrders(
		podcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id),
		handle,
	)
	return isPodcastEpisodeOrderReleased || isTopicVideoOrderReleased
}

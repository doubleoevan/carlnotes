// a podcast episode's and its film's home order on the home page: the release that closes the gap each leaves, for
// one podcast episode, for the films of some podcast episodes, and for every podcast episode and film of a topic

import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { releaseHomeOrder, releaseTopicHomeOrders } from "./homeOrder"
import { type DbHandle, db } from "./index"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "./schema/podcast"

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
export async function releaseTopicPodcastEpisodeVideoHomeOrders(
	podcastEpisodeIds: string[],
	handle: DbHandle = db,
): Promise<boolean> {
	// the pinned films of those podcast episodes
	const homeOrderRows = await handle
		.select({ id: topicPodcastEpisodeVideos.id })
		.from(topicPodcastEpisodeVideos)
		.where(
			and(
				inArray(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeIds),
				isNotNull(topicPodcastEpisodeVideos.homeOrder),
			),
		)

	// release each in turn
	for (const homeOrderRow of homeOrderRows) {
		await releaseHomeOrder({ table: topicPodcastEpisodeVideos, id: homeOrderRow.id, handle })
	}
	return homeOrderRows.length > 0
}

/**
 * Clears the home order of every podcast episode of a topic and of their films, one at a time so the orders stay
 * contiguous. Returns whether any had one.
 */
export async function releaseTopicPodcastEpisodeHomeOrders(topicId: string, handle: DbHandle = db): Promise<boolean> {
	// release the topic's pinned podcast episodes
	const isPodcastEpisodeOrderReleased = await releaseTopicHomeOrders({ table: podcastEpisodes, topicId, handle })

	// then the films of every podcast episode of the topic
	const podcastEpisodeRows = await handle
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.topicId, topicId))
	const isTopicPodcastEpisodeVideoOrderReleased = await releaseTopicPodcastEpisodeVideoHomeOrders(
		podcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id),
		handle,
	)
	return isPodcastEpisodeOrderReleased || isTopicPodcastEpisodeVideoOrderReleased
}

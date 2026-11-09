// a podcast episode's home order on the home page: the release that closes the gap it leaves, for one episode and
// for every episode of a topic

import { and, eq, isNotNull } from "drizzle-orm"
import { releaseHomeOrder } from "./homeOrder"
import { type DbHandle, db } from "./index"
import { podcastEpisodes } from "./schema/podcast"

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
 * Clears the home order of every podcast episode of a topic, one at a time so the orders stay contiguous.
 * Returns whether any had one.
 */
export async function releaseTopicPodcastEpisodeHomeOrders(topicId: string, handle: DbHandle = db): Promise<boolean> {
	// the topic's pinned episodes, each released on its own so the gap closes each time
	const homeOrderRows = await handle
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(and(eq(podcastEpisodes.topicId, topicId), isNotNull(podcastEpisodes.homeOrder)))

	// release each in turn
	for (const homeOrderRow of homeOrderRows) {
		await releasePodcastEpisodeHomeOrder(homeOrderRow.id, handle)
	}
	return homeOrderRows.length > 0
}

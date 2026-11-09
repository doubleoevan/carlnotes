// a podcast episode's feature order on the home page: the release that closes the gap it leaves, for one episode and
// for every episode of a topic

import { and, eq, isNotNull } from "drizzle-orm"
import { releaseFeatureOrder } from "./featureOrder"
import { type DbHandle, db } from "./index"
import { podcastEpisodes } from "./schema/podcast"

/**
 * Clears a podcast episode's feature order and moves everything below it up one. Returns whether it had one.
 */
export async function releasePodcastEpisodeFeatureOrder(
	podcastEpisodeId: string,
	handle: DbHandle = db,
): Promise<boolean> {
	return releaseFeatureOrder({ table: podcastEpisodes, id: podcastEpisodeId, handle })
}

/**
 * Clears the feature order of every podcast episode of a topic, one at a time so the orders stay contiguous.
 * Returns whether any had one.
 */
export async function releaseTopicPodcastEpisodeFeatureOrders(
	topicId: string,
	handle: DbHandle = db,
): Promise<boolean> {
	// the topic's pinned episodes, each released on its own so the gap closes each time
	const featuredRows = await handle
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(and(eq(podcastEpisodes.topicId, topicId), isNotNull(podcastEpisodes.featureOrder)))

	// release each in turn
	for (const featuredRow of featuredRows) {
		await releasePodcastEpisodeFeatureOrder(featuredRow.id, handle)
	}
	return featuredRows.length > 0
}

// what a topic image change leaves behind: the cached podcast feeds that list the old cover urls, and the stored
// covers drawn over the old image, which no feed names once the keys change

import { db } from "@carlnotes/db"
import { deletePodcastFeedCache } from "@carlnotes/db/podcastFeedCache"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { deleteStoredObjects, listStoredObjectKeys } from "@carlnotes/db/store"
import { toPodcastCoverObjectKeyPrefix } from "@carlnotes/server/podcastCoverPaths"
import { and, eq, isNull } from "drizzle-orm"

/**
 * Deletes a topic's cached podcast feeds and the stored covers drawn over its image: the show cover and the covers of
 * its published podcast episodes with no image of their own. Each is drawn again on its next request.
 */
export async function forgetTopicCovers(topicId: string): Promise<void> {
	// the feeds first, so no podcast app reads a cover url the next render will not serve
	await deletePodcastFeedCache(topicId)

	// the show cover, and each episode cover drawn over the topic's image
	const episodeRows = await db
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(
			and(
				eq(podcastEpisodes.topicId, topicId),
				eq(podcastEpisodes.status, "published"),
				isNull(podcastEpisodes.imageHash),
			),
		)
	const coverKeyPrefixes = [
		toPodcastCoverObjectKeyPrefix("show", topicId),
		...episodeRows.map((episodeRow) => toPodcastCoverObjectKeyPrefix("episode", episodeRow.id)),
	]
	const coverKeys = (await Promise.all(coverKeyPrefixes.map(listStoredObjectKeys))).flat()
	await deleteStoredObjects(coverKeys)
}

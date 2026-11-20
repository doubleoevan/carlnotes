// the rows that a podcast cover is made from: a show cover from its Topic, and a podcast episode's cover from the
// podcast episode and its Topic

import { type PodcastCover, toPodcastEpisodeCover } from "@carlnotes/contracts/podcastEpisodes"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { eq } from "drizzle-orm"

// the kind of cover that a url or a step names, and the id of its Topic or its podcast episode
type LoadPodcastCoverOptions = { kind: string; id: string }

/**
 * Loads the cover of a Topic's show or of a podcast episode and whether its Topic is public, or null if no such cover
 * exists.
 */
export async function loadPodcastCover({
	kind,
	id,
}: LoadPodcastCoverOptions): Promise<{ podcastCover: PodcastCover; isPublic: boolean } | null> {
	// a show cover's id names its Topic
	if (kind === "show") {
		const [topic] = await db.select().from(topics).where(eq(topics.id, id))
		const podcastCover = {
			kind: "show" as const,
			id,
			title: topic?.name ?? "",
			topicId: id,
			topicImageHash: topic?.imageHash ?? null,
		}
		return topic ? { podcastCover, isPublic: topic.visibility === "public" } : null
	}

	// a podcast episode cover's id names a podcast episode
	const [podcastEpisodeRow] = await db
		.select({
			title: podcastEpisodes.title,
			status: podcastEpisodes.status,
			season: podcastEpisodes.season,
			episodeNumber: podcastEpisodes.episodeNumber,
			imageHash: podcastEpisodes.imageHash,
			visibility: topics.visibility,
			topicId: topics.id,
			topicName: topics.name,
			topicImageHash: topics.imageHash,
		})
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(eq(podcastEpisodes.id, id))

	// an unknown kind, a removed podcast episode, and a podcast episode with no title yet have no cover
	if (kind !== "episode" || !podcastEpisodeRow?.title || podcastEpisodeRow.status === "removed") {
		return null
	}
	const { title, topicId, topicName, topicImageHash } = podcastEpisodeRow
	const podcastCover = toPodcastEpisodeCover(
		{ ...podcastEpisodeRow, id, title },
		{ id: topicId, name: topicName, imageHash: topicImageHash },
	)
	return { podcastCover, isPublic: podcastEpisodeRow.visibility === "public" }
}

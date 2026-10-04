// the chapters that narrated a Resource in a Topic's Podcast Episodes, as a new Finding of that Resource reads them:
// the newest chapter rating that the Finding takes, and the link from those chapters to the Finding
import { and, desc, eq, inArray, isNotNull, isNull, type SQL, sql } from "drizzle-orm"
import { db } from "../../db"
import { podcastEpisodeChapters, podcastEpisodes } from "../../db/schema"

// a topic and one of its resources
export type TopicResourceRef = { topicId: string; resourceId: string }

/**
 * Returns the newest rating of a chapter that narrated the resource in one of the topic's podcast episodes, as a subquery.
 */
export function toPodcastEpisodeChapterRatingSql({ topicId, resourceId }: TopicResourceRef): SQL {
	// the rated chapters of the resource in the topic's podcast episodes, newest first
	const podcastEpisodeChapterRatingQuery = db
		.select({ rating: podcastEpisodeChapters.rating })
		.from(podcastEpisodeChapters)
		.innerJoin(podcastEpisodes, eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodes.id))
		.where(
			and(
				eq(podcastEpisodes.topicId, topicId),
				eq(podcastEpisodeChapters.resourceId, resourceId),
				isNotNull(podcastEpisodeChapters.rating),
			),
		)
		.orderBy(desc(podcastEpisodes.createdAt))
		.limit(1)
	return sql`(${podcastEpisodeChapterRatingQuery})`
}

/**
 * Links the topic's chapters that narrated the resource and lost their finding to the new finding, which holds the
 * rating that the chapters had.
 */
export async function linkPodcastEpisodeChapters({
	topicId,
	resourceId,
	findingId,
}: TopicResourceRef & { findingId: string }): Promise<void> {
	// the ids of the topic's podcast episodes, as a subquery
	const topicPodcastEpisodeIds = db
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.topicId, topicId))

	// link the podcast episodes' chapters of the resource that have no finding,
	// and clear the rating that the finding now holds
	await db
		.update(podcastEpisodeChapters)
		.set({ findingId, rating: null })
		.where(
			and(
				eq(podcastEpisodeChapters.resourceId, resourceId),
				isNull(podcastEpisodeChapters.findingId),
				inArray(podcastEpisodeChapters.podcastEpisodeId, topicPodcastEpisodeIds),
			),
		)
}

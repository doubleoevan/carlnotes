// the chapters that narrated a Resource in a Topic's Podcast Episodes, as a new Finding of that Resource reads them:
// the newest chapter rating that the Finding takes, and the link from those chapters to the Finding

import { db } from "@carlnotes/db"
import { podcastEpisodeChapters, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { and, desc, eq, exists, inArray, isNotNull, isNull, type SQL, type SQLWrapper, sql } from "drizzle-orm"

// a topic and one of its resources
export type TopicResourceRef = { topicId: string; resourceId: string }

// the rated chapters of a resource in a topic's podcast episodes. the resource is an id, or a column for a read of
// many resources
function toRatedChapterFilter(topicId: string, resourceId: string | SQLWrapper): SQL | undefined {
	return and(
		eq(podcastEpisodes.topicId, topicId),
		eq(podcastEpisodeChapters.resourceId, resourceId),
		isNotNull(podcastEpisodeChapters.rating),
	)
}

/**
 * Returns the newest rating of a chapter that narrated the resource in one of the topic's podcast episodes, as a subquery.
 */
export function toPodcastEpisodeChapterRatingSql({ topicId, resourceId }: TopicResourceRef): SQL {
	// the rated chapters of the resource in the topic's podcast episodes, newest first
	const podcastEpisodeChapterRatingQuery = db
		.select({ rating: podcastEpisodeChapters.rating })
		.from(podcastEpisodeChapters)
		.innerJoin(podcastEpisodes, eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodes.id))
		.where(toRatedChapterFilter(topicId, resourceId))
		.orderBy(desc(podcastEpisodes.createdAt))
		.limit(1)

	// the one rating, as a value in the statement that reads it
	return sql`(${podcastEpisodeChapterRatingQuery})`
}

/**
 * Returns whether a chapter that narrated the resource in one of the topic's podcast episodes holds a rating. If the
 * topic has no finding of the resource, the next one takes that rating. The resource is a column of the read that the
 * condition is part of.
 */
export function hasRatedPodcastEpisodeChapter(topicId: string, resourceId: SQLWrapper): SQL {
	return exists(
		db
			.select({ id: podcastEpisodeChapters.id })
			.from(podcastEpisodeChapters)
			.innerJoin(podcastEpisodes, eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodes.id))
			.where(toRatedChapterFilter(topicId, resourceId)),
	)
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

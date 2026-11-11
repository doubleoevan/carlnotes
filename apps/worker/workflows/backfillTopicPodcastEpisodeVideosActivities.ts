// podcast episode film backfill activities: the listing of each Topic's latest podcast episode that has no film. the
// renders are the film queue's own activities. they run in the worker process, not the sandbox

import { db } from "@carlnotes/db"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm"

// where a page of the listing ends: the last Topic's place in the public-first, oldest-first order, with its time as
// the database wrote it
export type BackfillTopicPodcastEpisodeVideoCursor = { publicRank: 0 | 1; createdAt: string; id: string }

// when the backfill started, where the page starts, and how many Topics it reads
export type ListBackfillPodcastEpisodeIdsOptions = {
	startedAt: string
	afterTopic?: BackfillTopicPodcastEpisodeVideoCursor
	limit: number
}

// one page's podcast episodes, and the cursor of the next page, or null on the last page
export type BackfillPodcastEpisodePage = {
	podcastEpisodeIds: string[]
	nextCursor: BackfillTopicPodcastEpisodeVideoCursor | null
}

/**
 * Lists each Topic's latest published podcast episode, if it was published before the backfill started and has no film
 * row in any status, public Topics first and then by creation. An older podcast episode is never listed.
 */
export async function listBackfillPodcastEpisodeIds({
	startedAt,
	afterTopic,
	limit,
}: ListBackfillPodcastEpisodeIdsOptions): Promise<BackfillPodcastEpisodePage> {
	// each Topic's latest published podcast episode
	const latestPodcastEpisode = db
		.select({ id: podcastEpisodes.id, publishedAt: podcastEpisodes.publishedAt })
		.from(podcastEpisodes)
		.where(and(eq(podcastEpisodes.topicId, topics.id), eq(podcastEpisodes.status, "published")))
		.orderBy(desc(podcastEpisodes.publishedAt))
		.limit(1)
		.as("latest_episode")

	// public Topics first, oldest first within each, then by id, which the cursor compares as one row
	const publicRank = sql`case when ${topics.visibility} = 'public' then 0 else 1 end`
	const cursorFilter = afterTopic
		? sql`(${publicRank}, ${topics.createdAt}, ${topics.id}) > (${afterTopic.publicRank}, ${afterTopic.createdAt}::timestamptz, ${afterTopic.id})`
		: undefined

	// one page of Topics whose latest podcast episode has no film, with each Topic's time as text
	const topicRows = await db
		.select({
			id: topics.id,
			createdAt: sql<string>`${topics.createdAt}::text`,
			visibility: topics.visibility,
			podcastEpisodeId: latestPodcastEpisode.id,
		})
		.from(topics)
		.innerJoinLateral(latestPodcastEpisode, sql`true`)
		.leftJoin(topicPodcastEpisodeVideos, eq(topicPodcastEpisodeVideos.podcastEpisodeId, latestPodcastEpisode.id))
		.where(
			and(
				isNull(topicPodcastEpisodeVideos.id),
				lt(latestPodcastEpisode.publishedAt, new Date(startedAt)),
				cursorFilter,
			),
		)
		.orderBy(asc(publicRank), asc(topics.createdAt), asc(topics.id))
		.limit(limit)

	// a full page may have more after it, and the next page starts after its last Topic
	const lastTopic = topicRows.length === limit ? topicRows[topicRows.length - 1] : undefined
	return {
		podcastEpisodeIds: topicRows.map((topicRow) => topicRow.podcastEpisodeId),
		nextCursor: lastTopic
			? { publicRank: lastTopic.visibility === "public" ? 0 : 1, createdAt: lastTopic.createdAt, id: lastTopic.id }
			: null,
	}
}

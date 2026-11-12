// podcast episode film backfill activities: the listing of each Topic's latest podcast episode that has no film, then
// of every ready film below the current render version. the renders are the film queue's own activities. they run in
// the worker process, not the sandbox

import { db } from "@carlnotes/db"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import {
	isTopicPodcastEpisodeVideoBelowRenderVersion,
	TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION,
} from "@carlnotes/pipeline/topicPodcastEpisodeVideo/topicPodcastEpisodeVideoRows"
import { and, asc, count, desc, eq, isNull, lt, or, sql } from "drizzle-orm"
import {
	BACKFILL_TOPIC_ORDER,
	type BackfillTopicCursor,
	toAfterTopicFilter,
	toBackfillTopicCursor,
	topicPublicRank,
} from "./backfillTopicCursor"

// where a page of the Topics' listing ends. a cursor with no kind is a Topic's
type BackfillTopicPageCursor = BackfillTopicCursor & { kind?: "topic" }

// where a page of the films' listing ends: the last film's place in the public-first order, by its row's id
type BackfillFilmCursor = { kind: "film"; publicRank: 0 | 1; id: string }

// where a page of the listing ends: in the Topics with no film, or after them in the films to render again
export type BackfillTopicPodcastEpisodeVideoCursor = BackfillTopicPageCursor | BackfillFilmCursor

// when the backfill started, where the page starts, and how many Topics or films it reads
export type ListBackfillPodcastEpisodeIdsOptions = {
	startedAt: string
	afterCursor?: BackfillTopicPodcastEpisodeVideoCursor
	limit: number
}

// one page's podcast episodes, the cursor of the next page, or null on the last page, and how many podcast episodes
// the backfill has left with this page: the page's own Topics, and every film still to render again
export type BackfillPodcastEpisodePage = {
	podcastEpisodeIds: string[]
	nextCursor: BackfillTopicPodcastEpisodeVideoCursor | null
	remainingPodcastEpisodeCount: number
}

// a ready film below the current render version whose render at that version has not failed for good
const isFilmToRerender = and(
	isTopicPodcastEpisodeVideoBelowRenderVersion,
	or(
		isNull(topicPodcastEpisodeVideos.failedRenderVersion),
		lt(topicPodcastEpisodeVideos.failedRenderVersion, TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION),
	),
)

/**
 * Lists the podcast episodes the backfill renders, a page at a time: first each Topic's latest published podcast
 * episode, if it was published before the backfill started and has no film row in any status, public Topics first and
 * then by creation, and then every ready film below the current render version, public Topics first. An older
 * podcast episode with no film is never listed, and neither is a film whose render at this version failed for good.
 */
export async function listBackfillPodcastEpisodeIds({
	startedAt,
	afterCursor,
	limit,
}: ListBackfillPodcastEpisodeIdsOptions): Promise<BackfillPodcastEpisodePage> {
	// the Topics with no film come first, a full page at a time
	const filmsToRerenderCount = await countFilmsToRerender()
	const topicPage =
		afterCursor?.kind === "film"
			? { podcastEpisodeIds: [], nextCursor: null }
			: await listTopicPodcastEpisodeIds({ startedAt, afterTopic: afterCursor, limit })

	// what is left counts this page's Topics and every film still to render again
	const remainingPodcastEpisodeCount = topicPage.podcastEpisodeIds.length + filmsToRerenderCount
	if (topicPage.nextCursor) {
		return { ...topicPage, remainingPodcastEpisodeCount }
	}

	// once the Topics end, the films to render again follow on the same page
	const afterFilm = afterCursor?.kind === "film" ? afterCursor : undefined
	const filmPage = await listFilmPodcastEpisodeIds({ afterFilm, limit })
	return {
		podcastEpisodeIds: [...topicPage.podcastEpisodeIds, ...filmPage.podcastEpisodeIds],
		nextCursor: filmPage.nextCursor,
		remainingPodcastEpisodeCount,
	}
}

// how many ready films are still to render again at the current render version
async function countFilmsToRerender(): Promise<number> {
	const [filmCount] = await db.select({ filmCount: count() }).from(topicPodcastEpisodeVideos).where(isFilmToRerender)
	return filmCount?.filmCount ?? 0
}

// when the backfill started, the Topic the page starts after, and how many Topics it reads
type ListTopicPodcastEpisodeIdsOptions = { startedAt: string; afterTopic?: BackfillTopicCursor; limit: number }

// one page of the Topics whose latest published podcast episode has no film row, and the cursor of the next page
async function listTopicPodcastEpisodeIds({
	startedAt,
	afterTopic,
	limit,
}: ListTopicPodcastEpisodeIdsOptions): Promise<Omit<BackfillPodcastEpisodePage, "remainingPodcastEpisodeCount">> {
	// each Topic's latest published podcast episode
	const latestPodcastEpisode = db
		.select({ id: podcastEpisodes.id, publishedAt: podcastEpisodes.publishedAt })
		.from(podcastEpisodes)
		.where(and(eq(podcastEpisodes.topicId, topics.id), eq(podcastEpisodes.status, "published")))
		.orderBy(desc(podcastEpisodes.publishedAt))
		.limit(1)
		.as("latest_episode")

	// one page of Topics after the cursor whose latest podcast episode has no film, with each Topic's time as text
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
				toAfterTopicFilter(afterTopic),
			),
		)
		.orderBy(...BACKFILL_TOPIC_ORDER)
		.limit(limit)

	// a full page may have more after it, and the next page starts after its last Topic
	const lastTopic = topicRows.length === limit ? topicRows[topicRows.length - 1] : undefined
	return {
		podcastEpisodeIds: topicRows.map((topicRow) => topicRow.podcastEpisodeId),
		nextCursor: lastTopic ? toBackfillTopicCursor(lastTopic) : null,
	}
}

// the film the page starts after, and how many films it reads
type ListFilmPodcastEpisodeIdsOptions = { afterFilm?: BackfillFilmCursor; limit: number }

// one page of the ready films below the current render version, and the cursor of the next page
async function listFilmPodcastEpisodeIds({
	afterFilm,
	limit,
}: ListFilmPodcastEpisodeIdsOptions): Promise<Omit<BackfillPodcastEpisodePage, "remainingPodcastEpisodeCount">> {
	// public Topics' films first, then by the film row's id, which the cursor compares as one row
	const cursorFilter = afterFilm
		? sql`(${topicPublicRank}, ${topicPodcastEpisodeVideos.id}) > (${afterFilm.publicRank}, ${afterFilm.id})`
		: undefined

	// one page of films with their podcast episodes
	const filmRows = await db
		.select({
			id: topicPodcastEpisodeVideos.id,
			podcastEpisodeId: topicPodcastEpisodeVideos.podcastEpisodeId,
			publicRank: topicPublicRank,
		})
		.from(topicPodcastEpisodeVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
		.leftJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(and(isFilmToRerender, cursorFilter))
		.orderBy(asc(topicPublicRank), asc(topicPodcastEpisodeVideos.id))
		.limit(limit)

	// a full page may have more after it, and the next page starts after its last film
	const lastFilm = filmRows.length === limit ? filmRows[filmRows.length - 1] : undefined
	return {
		podcastEpisodeIds: filmRows.map((filmRow) => filmRow.podcastEpisodeId),
		nextCursor: lastFilm ? { kind: "film", publicRank: lastFilm.publicRank === 0 ? 0 : 1, id: lastFilm.id } : null,
	}
}

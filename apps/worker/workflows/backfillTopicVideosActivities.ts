// podcast episode film backfill activities: the listing of each Topic's latest podcast episode that has no film, then
// of every ready film below the current render version and every first render that failed and was never started
// again, with what the films left are estimated to cost the platform, and the read of whether a new film waits for a
// film Worker. the renders are the film queue's own activities. they run in the worker process, not the sandbox

import { TOPIC_VIDEO_TASK_QUEUE } from "@carlnotes/contracts/topicVideoWork"
import { db } from "@carlnotes/db"
import { podcastEpisodes, topicVideos } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { getClient, withClientDeadline } from "@carlnotes/pipeline/temporalClient"
import { describeTaskQueue } from "@carlnotes/pipeline/temporalTaskQueues"
import {
	isTopicVideoBelowRenderVersion,
	TOPIC_VIDEO_RENDER_VERSION,
} from "@carlnotes/pipeline/topicVideo/topicVideoRows"
import { and, asc, count, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"
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
export type BackfillTopicVideoCursor = BackfillTopicPageCursor | BackfillFilmCursor

// when the backfill started, where the page starts, and how many Topics or films it reads
export type ListBackfillPodcastEpisodeIdsOptions = {
	startedAt: string
	afterCursor?: BackfillTopicVideoCursor
	limit: number
}

// one page's podcast episodes, the cursor of the next page, or null on the last page, how many podcast episodes the
// backfill has left with this page: every Topic from this page on, and every film still to render, and what rendering
// them is estimated to cost the platform. a page listed by a worker from before the estimate has none
export type BackfillPodcastEpisodePage = {
	podcastEpisodeIds: string[]
	nextCursor: BackfillTopicVideoCursor | null
	remainingPodcastEpisodeCount: number
	estimatedRemainingCostDollars?: number
}

// what one film costs the platform on average. a first film generates its images, 24 cents on 2026-11-13. a film
// rendered again reuses them and costs its render minutes alone, about 13 minutes at a tenth of a cent.
// ponytail: two measured averages, the mean of the backfill's own spends rows if the estimate has to follow the films
const FIRST_FILM_PLATFORM_DOLLARS = 0.24
const RERENDERED_FILM_PLATFORM_DOLLARS = 0.013

// a ready film below the current render version whose render at that version has not failed for good
const isFilmToRerender = and(
	isTopicVideoBelowRenderVersion,
	or(isNull(topicVideos.failedRenderVersion), lt(topicVideos.failedRenderVersion, TOPIC_VIDEO_RENDER_VERSION)),
)

// a first render that failed and was never started again, by the reaper or by an earlier backfill. a podcast episode
// that is missing its inputs failed for good, and stays out
const isFailedFirstRender = and(
	eq(topicVideos.status, "failed"),
	isNull(topicVideos.restartedAt),
	sql`${topicVideos.error} is distinct from 'missing-inputs'`,
)

/**
 * Lists the podcast episodes the backfill renders, a page at a time: first each Topic's latest published podcast
 * episode, if it was published before the backfill started and has no film row in any status, public Topics first and
 * then by creation, and then every ready film below the current render version and every first render that failed
 * and was never started again, public Topics first. An older podcast episode with no film is never listed, and
 * neither is a film whose render at this version failed for good. A failed first render is listed once: the listing
 * records that it was started again.
 */
export async function listBackfillPodcastEpisodeIds({
	startedAt,
	afterCursor,
	limit,
}: ListBackfillPodcastEpisodeIdsOptions): Promise<BackfillPodcastEpisodePage> {
	// the Topics with no film come first, a full page at a time
	const filmsLeft = await countFilmsLeft()
	const isPastTopics = afterCursor?.kind === "film"
	const topicPage = isPastTopics
		? { podcastEpisodeIds: [], nextCursor: null }
		: await listTopicPodcastEpisodeIds({ startedAt, afterTopic: afterCursor, limit })

	// what is left counts every Topic from this page on, whatever the page's length, and every film still to render,
	// with what a first film and a film rendered again cost the platform on average
	const topicsLeftCount = isPastTopics ? 0 : await countTopicsWithoutFilm({ startedAt, afterTopic: afterCursor })
	const firstFilmCount = topicsLeftCount + filmsLeft.failedFirstRenderCount
	const remainingPodcastEpisodeCount = firstFilmCount + filmsLeft.filmsToRerenderCount
	const estimatedRemainingCostDollars = toDollarsAndCents(
		firstFilmCount * FIRST_FILM_PLATFORM_DOLLARS + filmsLeft.filmsToRerenderCount * RERENDERED_FILM_PLATFORM_DOLLARS,
	)
	if (topicPage.nextCursor) {
		return { ...topicPage, remainingPodcastEpisodeCount, estimatedRemainingCostDollars }
	}

	// once the Topics end, the films to render again follow on the same page
	const afterFilm = afterCursor?.kind === "film" ? afterCursor : undefined
	const filmPage = await listFilmPodcastEpisodeIds({ afterFilm, limit })
	return {
		podcastEpisodeIds: [...topicPage.podcastEpisodeIds, ...filmPage.podcastEpisodeIds],
		nextCursor: filmPage.nextCursor,
		remainingPodcastEpisodeCount,
		estimatedRemainingCostDollars,
	}
}

// an estimate in dollars, rounded to the cent
function toDollarsAndCents(dollars: number): number {
	return Math.round(dollars * 100) / 100
}

// how many ready films are still to render again at the current render version, and how many first renders failed and
// were never started again
async function countFilmsLeft(): Promise<{ filmsToRerenderCount: number; failedFirstRenderCount: number }> {
	const [filmCounts] = await db
		.select({
			filmsToRerenderCount: sql<number>`count(*) filter (where ${isFilmToRerender})::int`,
			failedFirstRenderCount: sql<number>`count(*) filter (where ${isFailedFirstRender})::int`,
		})
		.from(topicVideos)
		.where(or(isFilmToRerender, isFailedFirstRender))
	return {
		filmsToRerenderCount: Number(filmCounts?.filmsToRerenderCount ?? 0),
		failedFirstRenderCount: Number(filmCounts?.failedFirstRenderCount ?? 0),
	}
}

// when the backfill started, and the Topic the read starts after
type TopicsWithoutFilmOptions = { startedAt: string; afterTopic?: BackfillTopicCursor }

// when the backfill started, the Topic the page starts after, and how many Topics it reads
type ListTopicPodcastEpisodeIdsOptions = TopicsWithoutFilmOptions & { limit: number }

/**
 * Returns how many films are left to render as of now: every Topic whose latest published podcast episode has no film,
 * every ready film below the current render version, and every first render that failed and was never started again.
 */
export async function countTopicVideosLeft(): Promise<number> {
	const [topicsLeftCount, filmsLeft] = await Promise.all([
		countTopicsWithoutFilm({ startedAt: new Date().toISOString() }),
		countFilmsLeft(),
	])
	return topicsLeftCount + filmsLeft.filmsToRerenderCount + filmsLeft.failedFirstRenderCount
}

// each Topic's latest published podcast episode, as the lateral subquery the Topics' reads join
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's subquery type is generated, and naming it here would break on an upgrade
function toLatestPodcastEpisode() {
	// the newest published podcast episode of the Topic in the outer query
	return db
		.select({ id: podcastEpisodes.id, publishedAt: podcastEpisodes.publishedAt })
		.from(podcastEpisodes)
		.where(and(eq(podcastEpisodes.topicId, topics.id), eq(podcastEpisodes.status, "published")))
		.orderBy(desc(podcastEpisodes.publishedAt))
		.limit(1)
		.as("latest_episode")
}

// how many Topics after the cursor have a latest podcast episode with no film, across every page that is left
async function countTopicsWithoutFilm({ startedAt, afterTopic }: TopicsWithoutFilmOptions): Promise<number> {
	const latestPodcastEpisode = toLatestPodcastEpisode()
	const [topicCount] = await db
		.select({ topicCount: count() })
		.from(topics)
		// the same joins and filter as the Topics' listing, with no page limit
		.innerJoinLateral(latestPodcastEpisode, sql`true`)
		.leftJoin(topicVideos, eq(topicVideos.podcastEpisodeId, latestPodcastEpisode.id))
		.where(
			and(
				isNull(topicVideos.id),
				lt(latestPodcastEpisode.publishedAt, new Date(startedAt)),
				toAfterTopicFilter(afterTopic),
			),
		)
	return topicCount?.topicCount ?? 0
}

// one page of the Topics whose latest published podcast episode has no film row, and the cursor of the next page
async function listTopicPodcastEpisodeIds({
	startedAt,
	afterTopic,
	limit,
}: ListTopicPodcastEpisodeIdsOptions): Promise<Omit<BackfillPodcastEpisodePage, "remainingPodcastEpisodeCount">> {
	// one page of Topics after the cursor whose latest podcast episode has no film, with each Topic's time as text
	const latestPodcastEpisode = toLatestPodcastEpisode()
	const topicRows = await db
		.select({
			id: topics.id,
			createdAt: sql<string>`${topics.createdAt}::text`,
			visibility: topics.visibility,
			podcastEpisodeId: latestPodcastEpisode.id,
		})
		.from(topics)
		.innerJoinLateral(latestPodcastEpisode, sql`true`)
		.leftJoin(topicVideos, eq(topicVideos.podcastEpisodeId, latestPodcastEpisode.id))
		.where(
			and(
				isNull(topicVideos.id),
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

// one page of the ready films below the current render version and of the failed first renders never started again,
// and the cursor of the next page. each failed first render on the page is recorded as started again, so no later
// listing finds it
async function listFilmPodcastEpisodeIds({
	afterFilm,
	limit,
}: ListFilmPodcastEpisodeIdsOptions): Promise<Omit<BackfillPodcastEpisodePage, "remainingPodcastEpisodeCount">> {
	// public Topics' films first, then by the film row's id, which the cursor compares as one row
	const cursorFilter = afterFilm
		? sql`(${topicPublicRank}, ${topicVideos.id}) > (${afterFilm.publicRank}, ${afterFilm.id})`
		: undefined

	// one page of films with their podcast episodes
	const filmRows = await db
		.select({
			id: topicVideos.id,
			podcastEpisodeId: topicVideos.podcastEpisodeId,
			publicRank: topicPublicRank,
			status: topicVideos.status,
		})
		.from(topicVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicVideos.podcastEpisodeId))
		.leftJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(and(or(isFilmToRerender, isFailedFirstRender), cursorFilter))
		.orderBy(asc(topicPublicRank), asc(topicVideos.id))
		.limit(limit)

	// a failed first render is rendered once more and never after that
	const failedFilmIds = filmRows.filter((filmRow) => filmRow.status === "failed").map((filmRow) => filmRow.id)
	if (failedFilmIds.length > 0) {
		await db
			.update(topicVideos)
			.set({ restartedAt: new Date() })
			.where(and(inArray(topicVideos.id, failedFilmIds), eq(topicVideos.status, "failed")))
	}

	// a full page may have more after it, and the next page starts after its last film
	const lastFilm = filmRows.length === limit ? filmRows[filmRows.length - 1] : undefined
	return {
		podcastEpisodeIds: filmRows.map((filmRow) => filmRow.podcastEpisodeId),
		nextCursor: lastFilm ? { kind: "film", publicRank: lastFilm.publicRank === 0 ? 0 : 1, id: lastFilm.id } : null,
	}
}

/**
 * Returns whether a new podcast episode's film waits for a film Worker: the new films' queue holds a render that no
 * Worker has taken.
 */
export async function hasWaitingNewTopicVideo(): Promise<boolean> {
	const { backlogCount } = await describeTaskQueue(TOPIC_VIDEO_TASK_QUEUE)
	return backlogCount > 0
}

/** Admits an operator-selected ready film only while no new film or rebuild is running. */
export async function canUpgradeSelectedTopicVideo(podcastEpisodeId: string): Promise<boolean> {
	// Resolve readiness before contacting Temporal. Missing or already upgraded films consume no capacity.
	const [eligible] = await db
		.select({ id: topicVideos.id })
		.from(topicVideos)
		.where(
			and(
				eq(topicVideos.podcastEpisodeId, podcastEpisodeId),
				eq(topicVideos.status, "ready"),
				lt(topicVideos.renderVersion, 4),
			),
		)
		.limit(1)
	if (!eligible) {
		return false
	}
	const client = await getClient()
	const running = await withClientDeadline(client, () =>
		client.workflow.count(`ExecutionStatus = 'Running' AND TaskQueue = '${TOPIC_VIDEO_TASK_QUEUE}'`),
	)
	return Number(running.count) === 0
}

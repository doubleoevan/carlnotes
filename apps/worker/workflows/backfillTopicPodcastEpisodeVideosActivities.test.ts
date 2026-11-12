// the film backfill's listing: each Topic's latest published podcast episode with no film, published before the
// backfill started, then every ready film below the current render version, public Topics first, a page at a time
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION } from "@carlnotes/pipeline/topicPodcastEpisodeVideo/topicPodcastEpisodeVideoRows"
import { listBackfillPodcastEpisodeIds } from "./backfillTopicPodcastEpisodeVideosActivities"

// when the backfill started, and a Topic's time as the database writes it
const STARTED_AT = "2026-11-09T12:00:00.000Z"
const CREATED_AT = "2026-01-01 00:00:00.123456+00"

// put the pool's own query back after each test
afterEach(() => {
	restoreConnectionPool()
})

// what the stubbed pool returns: the Topics with no film, the films to render again, and how many such films there are
type ListingRows = { topicRows?: unknown[][]; filmRows?: unknown[][]; filmCount?: number }

// answer the listing's three reads by what each query selects
function stubListingReads({ topicRows = [], filmRows = [], filmCount = filmRows.length }: ListingRows): SentQuery[] {
	return stubConnectionPool(({ text }) => {
		if (text.startsWith("select count(*)")) {
			return [[filmCount]]
		}
		return text.includes("inner join lateral") ? topicRows : filmRows
	})
}

// the Topics' listing and the films' listing among the queries a test sent
const toTopicListingQuery = (sentQueries: SentQuery[]): SentQuery | undefined =>
	sentQueries.find((sentQuery) => sentQuery.text.includes("inner join lateral"))
const toFilmListingQuery = (sentQueries: SentQuery[]): SentQuery | undefined =>
	sentQueries.find((sentQuery) => sentQuery.text.includes('from "topic_podcast_episode_videos" inner join "episodes"'))

// the listing joins each Topic's one latest podcast episode and keeps the ones with no film row
test("the listing reads each Topic's latest podcast episode with no film, public Topics first", async () => {
	// two Topics, each with a latest podcast episode
	const sentQueries = stubListingReads({
		topicRows: [
			["topic-1", CREATED_AT, "public", "episode-1"],
			["topic-2", CREATED_AT, "private", "episode-2"],
		],
	})
	const podcastEpisodePage = await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, limit: 10 })
	expect(podcastEpisodePage).toEqual({
		podcastEpisodeIds: ["episode-1", "episode-2"],
		nextCursor: null,
		remainingPodcastEpisodeCount: 2,
	})

	// one latest published podcast episode per Topic, published before the start, with no film row
	const listingQuery = toTopicListingQuery(sentQueries)
	expect(listingQuery?.text).toContain('order by "episodes"."published_at" desc limit $')
	expect(listingQuery?.text).toContain('"topic_podcast_episode_videos"."id" is null')
	expect(listingQuery?.text).toContain('"latest_episode"."published_at" < $')
	expect(listingQuery?.values).toContain("published")

	// public Topics first, then the oldest, then by id
	expect(listingQuery?.text).toContain("= 'public' then 0 else 1 end")
	expect(listingQuery?.text).toContain('"topics"."created_at" asc, "topics"."id" asc limit $')
})

// a film row in any status keeps its podcast episode out, so a render skipped for a spent budget, which leaves a failed
// row, is never listed and never rendered on the platform's bill
test("the Topics' listing leaves out a podcast episode with a film row in any status", async () => {
	// list while every latest podcast episode has a film row
	const sentQueries = stubListingReads({})
	const podcastEpisodePage = await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, limit: 10 })
	expect(podcastEpisodePage).toEqual({ podcastEpisodeIds: [], nextCursor: null, remainingPodcastEpisodeCount: 0 })

	// the film join is on the podcast episode alone, with no status in it or in the filter
	const listingQuery = toTopicListingQuery(sentQueries)
	expect(listingQuery?.text).toContain(
		'left join "topic_podcast_episode_videos" on "topic_podcast_episode_videos"."episode_id" = "latest_episode"."id" where',
	)
	expect(listingQuery?.text).toContain('"topic_podcast_episode_videos"."id" is null')
	expect(listingQuery?.text).not.toContain('"topic_podcast_episode_videos"."status"')
	expect(listingQuery?.values).not.toContain("failed")
})

// a full page returns the cursor of its last Topic, which the next listing starts after
test("a full page of Topics returns the cursor of the next page, and lists no film yet", async () => {
	// a page as long as the limit
	const sentQueries = stubListingReads({
		topicRows: [
			["topic-1", CREATED_AT, "public", "episode-1"],
			["topic-2", CREATED_AT, "private", "episode-2"],
		],
		filmCount: 5,
	})
	const firstPage = await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, limit: 2 })
	expect(firstPage.nextCursor).toEqual({ publicRank: 1, createdAt: CREATED_AT, id: "topic-2" })
	expect(firstPage.remainingPodcastEpisodeCount).toBe(7)
	expect(toFilmListingQuery(sentQueries)).toBeUndefined()

	// the next page starts after the cursor, which has no kind and is read as a Topic's
	const afterCursor = firstPage.nextCursor ?? undefined
	await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, afterCursor, limit: 2 })
	const nextTopicListing = sentQueries.filter((sentQuery) => sentQuery.text.includes("inner join lateral"))[1]
	expect(nextTopicListing?.text).toContain(") > (")
	expect(nextTopicListing?.values).toContain("topic-2")
})

// once the Topics end, the same page goes on with the ready films below the current render version
test("the films below the current render version follow the Topics on the same page", async () => {
	const sentQueries = stubListingReads({
		topicRows: [["topic-1", CREATED_AT, "public", "episode-1"]],
		filmRows: [
			["film-7", "episode-7", 0],
			["film-8", "episode-8", 1],
		],
	})
	const podcastEpisodePage = await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, limit: 10 })
	expect(podcastEpisodePage).toEqual({
		podcastEpisodeIds: ["episode-1", "episode-7", "episode-8"],
		nextCursor: null,
		remainingPodcastEpisodeCount: 3,
	})

	// only a ready film below the current render version is listed, public Topics' films first, then by the film's id
	const filmListingQuery = toFilmListingQuery(sentQueries)
	expect(filmListingQuery?.text).toContain('"topic_podcast_episode_videos"."status" = $')
	expect(filmListingQuery?.text).toContain('"topic_podcast_episode_videos"."render_version" < $')
	expect(filmListingQuery?.values).toContain("ready")
	expect(filmListingQuery?.values).toContain(TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION)
	expect(filmListingQuery?.text).toContain('"topic_podcast_episode_videos"."id" asc limit $')
})

// a film at the current version has nothing below it to render, a film whose render at this version failed for good is
// not tried again, and one that failed at an earlier version is
test("the films' listing leaves out a current film and a film that failed at this version", async () => {
	const sentQueries = stubListingReads({})
	await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, limit: 10 })
	const filmListingQuery = toFilmListingQuery(sentQueries)
	expect(filmListingQuery?.text).toContain(
		'("topic_podcast_episode_videos"."failed_render_version" is null or "topic_podcast_episode_videos"."failed_render_version" < $',
	)

	// the count of the films left reads the same films
	const [filmCountQuery] = sentQueries.filter((sentQuery) => sentQuery.text.startsWith("select count(*)"))
	expect(filmCountQuery?.text).toContain('"topic_podcast_episode_videos"."render_version" < $')
	expect(filmCountQuery?.text).toContain('"topic_podcast_episode_videos"."failed_render_version" is null or')
})

// a full page of films returns a film cursor, and the page after it reads the films alone
test("a full page of films returns a film cursor, which the next page starts after", async () => {
	const sentQueries = stubListingReads({
		filmRows: [
			["film-7", "episode-7", 0],
			["film-8", "episode-8", 1],
		],
		filmCount: 9,
	})
	const firstPage = await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, limit: 2 })
	expect(firstPage.nextCursor).toEqual({ kind: "film", publicRank: 1, id: "film-8" })
	expect(firstPage.remainingPodcastEpisodeCount).toBe(9)

	// the next page skips the Topics and starts after the film
	sentQueries.length = 0
	const afterCursor = firstPage.nextCursor ?? undefined
	await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, afterCursor, limit: 2 })
	expect(toTopicListingQuery(sentQueries)).toBeUndefined()
	expect(toFilmListingQuery(sentQueries)?.text).toContain(") > (")
	expect(toFilmListingQuery(sentQueries)?.values).toContain("film-8")
})

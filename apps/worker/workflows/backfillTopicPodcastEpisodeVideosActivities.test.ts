// the film backfill's listing: each Topic's latest published podcast episode with no film, published before the
// backfill started, public Topics first, one page at a time
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { listBackfillPodcastEpisodeIds } from "./backfillTopicPodcastEpisodeVideosActivities"

// when the backfill started, and a Topic's time as the database writes it
const STARTED_AT = "2026-11-09T12:00:00.000Z"
const CREATED_AT = "2026-01-01 00:00:00.123456+00"

// put the pool's own query back after each test
afterEach(() => {
	restoreConnectionPool()
})

// the listing joins each Topic's one latest podcast episode and keeps the ones with no film row
test("the listing reads each Topic's latest podcast episode with no film, public Topics first", async () => {
	// two Topics, each with a latest podcast episode
	const sentQueries = stubConnectionPool(() => [
		["topic-1", CREATED_AT, "public", "episode-1"],
		["topic-2", CREATED_AT, "private", "episode-2"],
	])
	const podcastEpisodePage = await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, limit: 10 })
	expect(podcastEpisodePage).toEqual({ podcastEpisodeIds: ["episode-1", "episode-2"], nextCursor: null })

	// one latest published podcast episode per Topic, published before the start, with no film row
	const [listingQuery] = sentQueries
	expect(listingQuery?.text).toContain("inner join lateral")
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
test("the listing leaves out a podcast episode with a film row in any status", async () => {
	// list while every latest podcast episode has a film row
	const sentQueries = stubConnectionPool(() => [])
	const podcastEpisodePage = await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, limit: 10 })
	expect(podcastEpisodePage).toEqual({ podcastEpisodeIds: [], nextCursor: null })

	// the film join is on the podcast episode alone, with no status in it or in the filter
	const [listingQuery] = sentQueries
	expect(listingQuery?.text).toContain(
		'left join "topic_podcast_episode_videos" on "topic_podcast_episode_videos"."episode_id" = "latest_episode"."id" where',
	)
	expect(listingQuery?.text).toContain('"topic_podcast_episode_videos"."id" is null')
	expect(listingQuery?.text).not.toContain('"topic_podcast_episode_videos"."status"')
	expect(listingQuery?.values).not.toContain("failed")
})

// a full page returns the cursor of its last Topic, which the next listing starts after
test("a full page returns the cursor of the next page", async () => {
	// a page as long as the limit
	const sentQueries = stubConnectionPool(() => [
		["topic-1", CREATED_AT, "public", "episode-1"],
		["topic-2", CREATED_AT, "private", "episode-2"],
	])
	const firstPage = await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, limit: 2 })
	expect(firstPage.nextCursor).toEqual({ publicRank: 1, createdAt: CREATED_AT, id: "topic-2" })

	// the next page starts after the cursor
	const afterTopic = firstPage.nextCursor ?? undefined
	await listBackfillPodcastEpisodeIds({ startedAt: STARTED_AT, afterTopic, limit: 2 })
	expect(sentQueries[1]?.text).toContain(") > (")
	expect(sentQueries[1]?.values).toContain("topic-2")
})

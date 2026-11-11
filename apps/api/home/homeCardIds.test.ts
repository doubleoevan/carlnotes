// home card id tests: the home shows one podcast episode, one film, and one Topic Post per topic, in the order read,
// the reads behind the home films and the week's new Topic Posts, and the cached ids' reload once they are cleared
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { HOME_PODCAST_EPISODE_COUNT, NEW_PODCAST_EPISODE_DAYS, NEW_TOPIC_POST_DAYS } from "@carlnotes/contracts/home"
import { DAY_MS } from "@carlnotes/contracts/time"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { clearSharedTopicFeedCaches } from "../topic/feedCaches"
import { loadHomeCardIds, toFirstIdsPerTopic } from "./homeCardIds"

// read the home through an empty in-memory Redis
beforeEach(() => {
	stubRedisClient()
})

// put the connection pool and the Redis client back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

describe("one row per topic", () => {
	test("each topic shows its first row read, pinned rows first, up to the count", () => {
		// the pinned post of topic b leads, then the newest post of each other topic
		const topicPostRows = [
			{ id: "post-b-pinned", topicId: "topic-b" },
			{ id: "post-a-new", topicId: "topic-a" },
			{ id: "post-b-new", topicId: "topic-b" },
			{ id: "post-a-old", topicId: "topic-a" },
			{ id: "post-c-new", topicId: "topic-c" },
		]
		expect(toFirstIdsPerTopic(topicPostRows, 12)).toEqual(["post-b-pinned", "post-a-new", "post-c-new"])
		expect(toFirstIdsPerTopic(topicPostRows, 2)).toEqual(["post-b-pinned", "post-a-new"])
	})

	test("a row with no topic is left out, and no row reads as no card", () => {
		expect(toFirstIdsPerTopic([{ id: "episode-1", topicId: null }], 12)).toEqual([])
		expect(toFirstIdsPerTopic([], 12)).toEqual([])
	})

	test("keeps the first podcast episode read for each topic, in the order read", () => {
		const podcastEpisodeRows = [
			{ id: "pinned", topicId: "topic-1" },
			{ id: "most-listened", topicId: "topic-2" },
			{ id: "second-of-topic-1", topicId: "topic-1" },
			{ id: "no-topic", topicId: null },
			{ id: "next", topicId: "topic-3" },
		]
		const podcastEpisodeIds = toFirstIdsPerTopic(podcastEpisodeRows, HOME_PODCAST_EPISODE_COUNT)
		expect(podcastEpisodeIds).toEqual(["pinned", "most-listened", "next"])
	})

	test("stops at the home's twelve", () => {
		// one more topic than the home shows
		const podcastEpisodeRows = Array.from({ length: HOME_PODCAST_EPISODE_COUNT + 1 }, (_, i) => ({
			id: `episode-${i}`,
			topicId: `topic-${i}`,
		}))
		const podcastEpisodeIds = toFirstIdsPerTopic(podcastEpisodeRows, HOME_PODCAST_EPISODE_COUNT)
		expect(podcastEpisodeIds).toHaveLength(HOME_PODCAST_EPISODE_COUNT)
	})
})

describe("the home films", () => {
	// read the home card ids with no rows, and return the two film reads
	async function loadFilmQueries(): Promise<{ text: string; values: unknown[] }[]> {
		const sentQueries = stubConnectionPool(() => [])
		await loadHomeCardIds()
		return sentQueries.filter(({ text }) => text.includes('"topic_podcast_episode_videos"'))
	}

	test("read only ready films of published podcast episodes of public shown topics", async () => {
		const filmQueries = await loadFilmQueries()
		expect(filmQueries).toHaveLength(2)
		for (const { text, values } of filmQueries) {
			expect(text).toContain(
				'inner join "topic_podcast_episode_videos" on ("topic_podcast_episode_videos"."episode_id" = "episodes"."id" and "topic_podcast_episode_videos"."status" = $1)',
			)
			expect(values[0]).toBe("ready")
			expect(text).toContain('"topics"."visibility" = ')
			expect(values).toContain("published")
		}
	})

	test("Featured films reads the pinned films first, then the most listened", async () => {
		const [homeFilmQuery] = await loadFilmQueries()
		expect(homeFilmQuery?.text).toContain(
			'order by "topic_podcast_episode_videos"."home_order" is null, "topic_podcast_episode_videos"."home_order" asc, "episodes"."listener_count" desc, "episodes"."published_at" desc',
		)
	})

	test("New films this week reads the past seven days, newest first", async () => {
		const newestFilmQuery = (await loadFilmQueries())[1]
		expect(newestFilmQuery?.text).toContain('"episodes"."published_at" >= ')
		expect(newestFilmQuery?.text).toContain('order by "episodes"."published_at" desc')

		// the window starts seven days back
		const publishedSince = newestFilmQuery?.values.find((value) => typeof value === "string" && value.includes("T"))
		const windowDays = (Date.now() - new Date(String(publishedSince)).getTime()) / DAY_MS
		expect(Math.round(windowDays)).toBe(NEW_PODCAST_EPISODE_DAYS)
	})
})

describe("the week's new Topic Posts", () => {
	// whether a read is the week's new Topic Posts: the posts published since a time
	const isNewestTopicPostRead = ({ text }: { text: string }): boolean =>
		text.includes('from "topic_posts"') && text.includes('"topic_posts"."published_at" >= ')

	test("read the past seven days of public shown topics' posts, newest first, pinned or not", async () => {
		const sentQueries = stubConnectionPool(() => [])
		await loadHomeCardIds()
		const newestTopicPostQuery = sentQueries.find(isNewestTopicPostRead)

		// public shown topics alone, newest first, with no word on the home's pins
		expect(newestTopicPostQuery?.text).toContain('inner join "topics" on "topics"."id" = "topic_posts"."topic_id"')
		expect(newestTopicPostQuery?.text).toContain('"topics"."visibility" = ')
		expect(newestTopicPostQuery?.values).toContain("public")
		expect(newestTopicPostQuery?.text).toContain('order by "topic_posts"."published_at" desc')
		expect(newestTopicPostQuery?.text).not.toContain('"home_order"')

		// the window starts seven days back
		const publishedSince = newestTopicPostQuery?.values.find(
			(value) => typeof value === "string" && value.includes("T"),
		)
		const windowDays = (Date.now() - new Date(String(publishedSince)).getTime()) / DAY_MS
		expect(Math.round(windowDays)).toBe(NEW_TOPIC_POST_DAYS)
	})

	test("an empty week reads as no ids, and the week's posts keep the order read", async () => {
		// no post this week
		stubConnectionPool(() => [])
		expect((await loadHomeCardIds()).newestTopicPostIds).toEqual([])

		// two posts this week, the newer first, read once the cached ids are cleared
		await clearSharedTopicFeedCaches()
		stubConnectionPool((sentQuery) => (isNewestTopicPostRead(sentQuery) ? [["post-new"], ["post-old"]] : []))
		expect((await loadHomeCardIds()).newestTopicPostIds).toEqual(["post-new", "post-old"])
	})

	test("ride in the cached ids: a cache hit sends no read, and clearing the home's caches reads them again", async () => {
		// the first load reads the week's posts, and the second is served from the cache
		const sentQueries = stubConnectionPool(() => [])
		await loadHomeCardIds()
		const cacheMissQueryCount = sentQueries.length
		expect(sentQueries.filter(isNewestTopicPostRead)).toHaveLength(1)
		await loadHomeCardIds()
		expect(sentQueries).toHaveLength(cacheMissQueryCount)

		// what a publish, a delete, and a visibility change clear
		await clearSharedTopicFeedCaches()
		await loadHomeCardIds()
		expect(sentQueries.filter(isNewestTopicPostRead)).toHaveLength(2)
	})
})

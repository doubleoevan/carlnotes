// home card id tests: the home shows one podcast episode, one film, and one Topic Post per topic, in the order read,
// the reads behind the home films and the week's new Topic Posts, the cached ids' reload once they are cleared, the
// admin block that takes its user's rows out of every read, and the featured-only switch that leaves every read its
// featured rows alone
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { HOME_PODCAST_EPISODE_COUNT, NEW_PODCAST_EPISODE_DAYS, NEW_TOPIC_POST_DAYS } from "@carlnotes/contracts/home"
import { DAY_MS } from "@carlnotes/contracts/time"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import * as dailySpendCutoffs from "@carlnotes/db/dailySpendCutoffs"
import { DEFAULT_SPEND_CONTROL_SETTINGS } from "@carlnotes/db/dailySpendCutoffTestFixtures"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { topics } from "@carlnotes/db/schema/topics"
import { toTestPageHead } from "../pageReadTestFixtures"
import * as pageHead from "../share/pageHead"
import { clearSharedTopicFeedCaches } from "../topic/feedCaches"
import { topicsRoute } from "../topic/topicsRoute"
import { isTopicWithOwnerRead, toTopicWithOwnerRow } from "../topic/topicTestFixtures"
import { loadHomeCardIds, toFirstIdsPerTopic } from "./homeCardIds"

// read the home through an empty in-memory Redis
beforeEach(() => {
	stubRedisClient()
})

// put the spies, the connection pool, and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreRedisClient()
})

describe("one row per topic", () => {
	test("each topic shows its first row read, featured rows first, up to the count", () => {
		// the featured post of topic b leads, then the newest post of each other topic
		const topicPostRows = [
			{ id: "post-b-featured", topicId: "topic-b" },
			{ id: "post-a-new", topicId: "topic-a" },
			{ id: "post-b-new", topicId: "topic-b" },
			{ id: "post-a-old", topicId: "topic-a" },
			{ id: "post-c-new", topicId: "topic-c" },
		]
		expect(toFirstIdsPerTopic(topicPostRows, 12)).toEqual(["post-b-featured", "post-a-new", "post-c-new"])
		expect(toFirstIdsPerTopic(topicPostRows, 2)).toEqual(["post-b-featured", "post-a-new"])
	})

	test("a row with no topic is left out, and no row reads as no card", () => {
		expect(toFirstIdsPerTopic([{ id: "episode-1", topicId: null }], 12)).toEqual([])
		expect(toFirstIdsPerTopic([], 12)).toEqual([])
	})

	test("keeps the first podcast episode read for each topic, in the order read", () => {
		const podcastEpisodeRows = [
			{ id: "featured", topicId: "topic-1" },
			{ id: "most-listened", topicId: "topic-2" },
			{ id: "second-of-topic-1", topicId: "topic-1" },
			{ id: "no-topic", topicId: null },
			{ id: "next", topicId: "topic-3" },
		]
		const podcastEpisodeIds = toFirstIdsPerTopic(podcastEpisodeRows, HOME_PODCAST_EPISODE_COUNT)
		expect(podcastEpisodeIds).toEqual(["featured", "most-listened", "next"])
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
	// read the home card ids with no rows, and return the three film reads: the featured films, the ranked films, and
	// the week's films
	async function loadFilmQueries(): Promise<{ text: string; values: unknown[] }[]> {
		const sentQueries = stubConnectionPool(() => [])
		await loadHomeCardIds()
		return sentQueries.filter(({ text }) => text.includes('"topic_videos"'))
	}

	test("read only ready films of published podcast episodes of public shown topics", async () => {
		const filmQueries = await loadFilmQueries()
		expect(filmQueries).toHaveLength(3)
		for (const { text, values } of filmQueries) {
			expect(text).toContain(
				'inner join "topic_videos" on ("topic_videos"."episode_id" = "episodes"."id" and "topic_videos"."status" = $1)',
			)
			expect(values[0]).toBe("ready")
			expect(text).toContain('"topics"."visibility" = ')
			expect(values).toContain("published")
		}
	})

	test("Featured films reads the featured films in their order, and then the most listened in a read of their own", async () => {
		const [featuredFilmQuery, rankedFilmQuery] = await loadFilmQueries()
		expect(featuredFilmQuery?.text).toContain(
			'"topic_videos"."home_order" is not null) order by "topic_videos"."home_order" asc, "episodes"."listener_count" desc, "episodes"."published_at" desc',
		)
		expect(rankedFilmQuery?.text).toContain(
			'"topic_videos"."home_order" is null) order by "episodes"."listener_count" desc, "episodes"."published_at" desc',
		)
	})

	test("Featured films keeps the featured films first and one film per topic among the read's candidates", async () => {
		// a featured film and a ranked film of one topic, and a ranked film of another
		stubConnectionPool(({ text }) => {
			if (!text.includes('"topic_videos"') || text.includes('"published_at" >= ')) {
				return []
			}
			return text.includes('"home_order" is not null')
				? [["featured-film", "topic-1"]]
				: [
						["ranked-film-of-topic-1", "topic-1"],
						["ranked-film", "topic-2"],
					]
		})
		expect((await loadHomeCardIds()).homeFilmPodcastEpisodeIds).toEqual(["featured-film", "ranked-film"])
	})

	test("New films this week reads the past seven days, newest first", async () => {
		const newestFilmQuery = (await loadFilmQueries())[2]
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

	test("read the past seven days of public shown topics' posts, newest first, featured or not", async () => {
		const sentQueries = stubConnectionPool(() => [])
		await loadHomeCardIds()
		const newestTopicPostQuery = sentQueries.find(isNewestTopicPostRead)

		// public shown topics alone, newest first, with no word on the home's featured items
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

// whether a read is one of the home's id reads, which the settings read is not
function isHomeIdRead({ text }: SentQuery): boolean {
	return !text.includes('"spend_control_settings"')
}

// read the home card ids with no rows, and return the id reads in the order the home shows their sections: seven, and
// two more for the ranked films and podcast episodes unless the featured-only switch is on
async function loadHomeIdReads(): Promise<SentQuery[]> {
	const sentQueries = stubConnectionPool(() => [])
	await loadHomeCardIds()
	return sentQueries.filter(isHomeIdRead)
}

// the filter that leaves out a row whose user, named by a column, is under an admin block
function toAdminBlockFilterText(userIdColumn: string): string {
	return `not exists (select "id" from "users" where ("users"."id" = ${userIdColumn} and "users"."admin_blocked_at" is not null))`
}

// the filter every home read leaves a blocked owner's topic out with
const OWNER_ADMIN_BLOCK_FILTER_TEXT = toAdminBlockFilterText('"topics"."owner_id"')

describe("an admin block", () => {
	test("takes the user's topics, their podcast episodes, and their films out of every read", async () => {
		const homeIdReads = await loadHomeIdReads()
		expect(homeIdReads).toHaveLength(9)
		expect(homeIdReads.filter(({ text }) => text.includes(OWNER_ADMIN_BLOCK_FILTER_TEXT))).toHaveLength(9)
	})

	test("takes the Topic Posts the user wrote out of Featured posts and New posts this week", async () => {
		const homeIdReads = await loadHomeIdReads()
		const topicPostReads = homeIdReads.filter(({ text }) => text.includes('from "topic_posts"'))
		expect(topicPostReads).toHaveLength(2)

		// both Topic Post reads leave out a post whose author is blocked, and no other read names an author
		const authorFilterText = toAdminBlockFilterText('"topic_posts"."author_user_id"')
		for (const { text } of topicPostReads) {
			expect(text).toContain(authorFilterText)
		}
		expect(homeIdReads.filter(({ text }) => text.includes(authorFilterText))).toHaveLength(2)
	})

	test("leaves the blocked user's public Topic open at its url", async () => {
		// a public topic with the fields its page reads, whose owner is under an admin block
		const blockedOwnerAccessRow = ["user", "free", null, null, new Date("2026-11-13T00:00:00Z")]
		const topicRow = toTableRow(topics, {
			id: "topic-1",
			ownerId: "owner-1",
			name: "Agents",
			prompt: "agents",
			frequency: "daily",
			scheduledTime: "09:00:00",
			scheduledDayOfWeek: "monday",
			visibility: "public",
			tags: [],
			maxTopicFindings: 10,
			createdAt: new Date("2026-10-01T00:00:00Z"),
			updatedAt: new Date("2026-10-01T00:00:00Z"),
		})

		// the topic with its blocked owner, the topic row, and the owner's access row
		stubConnectionPool(({ text }) => {
			if (isTopicWithOwnerRead(text)) {
				return [toTopicWithOwnerRow(topicRow, "owner-1", blockedOwnerAccessRow)]
			}
			if (text.includes('from "topics" where "topics"."id" = $1')) {
				return [topicRow]
			}

			// the owner's access row, and nothing for any other read
			return text.includes('"admin_blocked_at" from "users"') ? [blockedOwnerAccessRow] : []
		})

		// a visitor's page load opens the topic
		spyOn(pageHead, "loadTopicPageHead").mockResolvedValue(toTestPageHead("Agents"))
		const response = await topicsRoute.request("/topics/topic-1")
		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({ id: "topic-1", name: "Agents" })
	})
})

describe("the featured-only switch", () => {
	// the filter each read adds while the switch is on, in the order the home shows the reads' sections
	const FEATURED_ONLY_FILTER_TEXTS = [
		'"topics"."feature_order" is not null',
		'"topic_videos"."home_order" is not null',
		'"topic_videos"."home_order" is not null',
		'"episodes"."feature_order" is not null',
		'"episodes"."feature_order" is not null',
		'"topic_posts"."home_order" is not null',
		'"topic_posts"."home_order" is not null',
	]

	// whether a read takes its featured rows alone
	const isFeaturedOnlyRead = ({ text }: SentQuery): boolean =>
		FEATURED_ONLY_FILTER_TEXTS.some((featuredOnlyFilterText) => text.includes(featuredOnlyFilterText))

	// read the settings as the defaults with the switch on or off
	function stubFeaturedOnlySwitch(isHomeFeaturedOnly: boolean): ReturnType<typeof spyOn> {
		return spyOn(dailySpendCutoffs, "loadSpendControlSettings").mockResolvedValue({
			...DEFAULT_SPEND_CONTROL_SETTINGS,
			isHomeFeaturedOnly,
		})
	}

	test("is off with no settings row, and only the featured films and podcast episodes are read apart", async () => {
		// the featured films and podcast episodes are reads of their own beside the ranked ones, and no other read is
		// limited to its featured rows
		const homeIdReads = await loadHomeIdReads()
		expect(homeIdReads).toHaveLength(9)
		expect(homeIdReads.filter(isFeaturedOnlyRead)).toHaveLength(2)
	})

	test("on, every read takes the rows an admin featured alone, in the same order", async () => {
		stubFeaturedOnlySwitch(true)
		const homeIdReads = await loadHomeIdReads()

		// each of the seven reads holds its own home order filter
		expect(homeIdReads).toHaveLength(7)
		for (const [i, featuredOnlyFilterText] of FEATURED_ONLY_FILTER_TEXTS.entries()) {
			expect(homeIdReads[i]?.text).toContain(featuredOnlyFilterText)
		}

		// the featured rows stay in their order, and the week's rows stay newest first
		expect(homeIdReads[0]?.text).toContain('order by "topics"."feature_order" is null, "topics"."feature_order" asc')
		expect(homeIdReads[2]?.text).toContain('order by "episodes"."published_at" desc')

		// a featured row of a blocked owner's topic is still left out
		expect(homeIdReads.filter(({ text }) => text.includes(OWNER_ADMIN_BLOCK_FILTER_TEXT))).toHaveLength(7)
	})

	test("on, an unfeatured row leaves every list, and a week with no featured row reads as no ids", async () => {
		// a database where nothing is featured. only a read of every row returns one
		stubFeaturedOnlySwitch(true)
		const toUnfeaturedRows = (sentQuery: SentQuery): unknown[] =>
			isHomeIdRead(sentQuery) && !isFeaturedOnlyRead(sentQuery) ? [["unfeatured-1", "topic-1"]] : []
		stubConnectionPool(toUnfeaturedRows)
		const featuredOnlyIds = await loadHomeCardIds()

		// no list holds the unfeatured row, so each week's section is absent
		expect(Object.values(featuredOnlyIds)).toEqual([[], [], [], [], [], [], []])

		// the switch off fills every list again on the next cache refresh
		stubFeaturedOnlySwitch(false)
		await clearSharedTopicFeedCaches()
		stubConnectionPool(toUnfeaturedRows)
		expect(Object.values(await loadHomeCardIds())).toEqual(Array.from({ length: 7 }, () => ["unfeatured-1"]))
	})

	test("is read with the ids, so the home follows it on its next cache refresh", async () => {
		// the switch on, read once for two loads of the cached ids
		const loadSpendControlSettingsSpy = stubFeaturedOnlySwitch(true)
		const sentQueries = stubConnectionPool(() => [])
		await loadHomeCardIds()
		await loadHomeCardIds()
		expect(loadSpendControlSettingsSpy).toHaveBeenCalledTimes(1)
		expect(sentQueries.filter(isFeaturedOnlyRead)).toHaveLength(7)

		// the cached ids outlive the switch until they are read again
		stubFeaturedOnlySwitch(false)
		await loadHomeCardIds()
		expect(sentQueries).toHaveLength(7)
		await clearSharedTopicFeedCaches()
		await loadHomeCardIds()
		expect(sentQueries.filter((sentQuery) => !isFeaturedOnlyRead(sentQuery))).toHaveLength(7)
	})
})

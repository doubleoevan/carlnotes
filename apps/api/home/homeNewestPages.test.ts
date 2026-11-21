// the week's new sections a page at a time: a home read that asks for no pages holds every list whole, a paged read
// holds the page each list's query names, and a later page is cut from the visitors' copy without another card read
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { HomeResponse } from "@carlnotes/contracts/home"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as homeCardIds from "./homeCardIds"
import { homeRoute } from "./homeRoute"
import * as topicCards from "./topicCards"

// the week's eight new posts, newest first: one full page of six and a second page of two
const NEWEST_TOPIC_POST_IDS = ["post-1", "post-2", "post-3", "post-4", "post-5", "post-6", "post-7", "post-8"]

// each test reads the home through a Redis of its own, so no test reads another's copy of the visitors' home
beforeEach(() => {
	stubRedisClient()
})

// put the spies and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// stand in for the cached ids and the card reads: the week's eight new posts and no other card
function stubHomeReads(): ReturnType<typeof spyOn> {
	spyOn(homeCardIds, "loadHomeCardIds").mockResolvedValue({
		homeTopicIds: [],
		homePodcastEpisodeIds: [],
		newestPodcastEpisodeIds: [],
		homeTopicPostIds: [],
		newestTopicPostIds: NEWEST_TOPIC_POST_IDS,
	})
	return spyOn(topicCards, "loadHomeCards").mockImplementation(async ({ topicPostIds }) => ({
		homeTopics: [],
		yourTopicCards: [],
		podcastEpisodeCards: [],
		topicPostCards: topicPostIds.map((id) => ({ id }) as TopicPostCard),
	}))
}

// a visitor's read of a home route
async function readHomeRoute<Payload>(path: string): Promise<Payload> {
	const response = await homeRoute.request(path)
	expect(response.status).toBe(200)
	return (await response.json()) as Payload
}

test("a home read that asks for no pages holds every new post and no page positions", async () => {
	stubHomeReads()
	const home = await readHomeRoute<HomeResponse>("/home")
	expect(home.newestTopicPosts?.map(({ id }) => id)).toEqual(NEWEST_TOPIC_POST_IDS)
	expect(home.newestPages).toBeUndefined()
})

test("a paged home read holds the page each new list's query names, and the first page of the others", async () => {
	stubHomeReads()
	const home = await readHomeRoute<HomeResponse>("/home?paged=1&newestTopicPostsPage=1")

	// the second page of the posts, and the empty first page of the films and the podcast episodes
	expect(home.newestTopicPosts?.map(({ id }) => id)).toEqual(["post-7", "post-8"])
	expect(home.newestPages).toEqual({
		films: { page: 0, totalCount: 0 },
		podcastEpisodes: { page: 0, totalCount: 0 },
		topicPosts: { page: 1, totalCount: 8 },
	})
})

test("a page past the list's end holds its last page", async () => {
	stubHomeReads()
	const home = await readHomeRoute<HomeResponse>("/home?paged=1&newestTopicPostsPage=9")
	expect(home.newestTopicPosts?.map(({ id }) => id)).toEqual(["post-7", "post-8"])
	expect(home.newestPages?.topicPosts).toEqual({ page: 1, totalCount: 8 })
})

test("a later page of the new posts is cut from the visitors' copy, with no second card read", async () => {
	const loadTopicPostCardsSpy = stubHomeReads()
	await readHomeRoute<HomeResponse>("/home")
	const topicPostCardsPage = await readHomeRoute<{ topicPosts: { id: string }[]; totalCount: number }>(
		"/home/newest-topic-posts?page=1",
	)

	// the second page with the whole list's count, from the one card read the home made
	expect(topicPostCardsPage.topicPosts.map(({ id }) => id)).toEqual(["post-7", "post-8"])
	expect(topicPostCardsPage.totalCount).toBe(8)
	expect(loadTopicPostCardsSpy).toHaveBeenCalledTimes(1)
})

test("the later page routes of the films and the podcast episodes hold an empty page of an empty list", async () => {
	stubHomeReads()
	for (const path of ["/home/newest-films?page=0", "/home/newest-podcast-episodes?page=0"]) {
		expect(await readHomeRoute(path)).toEqual({ podcastEpisodes: [], totalCount: 0 })
	}
})

test("a later page route rejects a page that is not a page number", async () => {
	stubHomeReads()
	expect((await homeRoute.request("/home/newest-topic-posts?page=-1")).status).toBe(400)
	expect((await homeRoute.request("/home/newest-topic-posts")).status).toBe(400)
})

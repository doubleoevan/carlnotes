// home route tests: the home's and the week's Topic Posts come from one read of their cards, each list in its ids'
// order, the four film and podcast episode lists come from one read of theirs, and ids cached before the week's posts
// were read give an empty list
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { PodcastEpisodeCard } from "@carlnotes/contracts/home"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import * as topicPosts from "../topicPost/topicPosts"
import * as homeCardIds from "./homeCardIds"
import { homeRoute } from "./homeRoute"
import * as topicCards from "./topicCards"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// stand in for the cached ids and the card reads: no topic or podcast episode card, and each Topic Post id as a card
function stubHomeReads(homeTopicPostIds: string[], newestTopicPostIds?: string[]): ReturnType<typeof spyOn> {
	// the cached ids, with the two Topic Post lists
	spyOn(homeCardIds, "loadHomeCardIds").mockResolvedValue({
		homeTopicIds: [],
		homePodcastEpisodeIds: [],
		newestPodcastEpisodeIds: [],
		homeTopicPostIds,
		newestTopicPostIds,
	})

	// the card reads. a deleted post has no card
	spyOn(topicCards, "loadTopicCards").mockResolvedValue([])
	spyOn(topicCards, "loadPodcastEpisodeCards").mockResolvedValue([])
	return spyOn(topicPosts, "loadTopicPostCardsById").mockImplementation(async (topicPostIds) =>
		topicPostIds.filter((topicPostId) => topicPostId !== "post-deleted").map((id) => ({ id }) as TopicPostCard),
	)
}

// a visitor's home payload
async function loadVisitorHome(): Promise<Record<string, { id: string }[] | null>> {
	const response = await homeRoute.request("/home")
	expect(response.status).toBe(200)
	return (await response.json()) as Record<string, { id: string }[] | null>
}

test("a pinned post that is new this week shows in both lists, from one read of the cards", async () => {
	const loadTopicPostCardsSpy = stubHomeReads(["post-pinned", "post-a"], ["post-new", "post-pinned", "post-deleted"])
	const home = await loadVisitorHome()

	// each list in its ids' order, with no card for the deleted post
	expect(home.homeTopicPosts?.map(({ id }) => id)).toEqual(["post-pinned", "post-a"])
	expect(home.newestTopicPosts?.map(({ id }) => id)).toEqual(["post-new", "post-pinned"])

	// one read, each id once
	expect(loadTopicPostCardsSpy).toHaveBeenCalledTimes(1)
	expect(loadTopicPostCardsSpy.mock.calls[0]?.[0]).toEqual(["post-pinned", "post-a", "post-new", "post-deleted"])
})

test("the four film and podcast episode lists come from one read of their cards, each in its ids' order", async () => {
	// a podcast episode in three lists, one gone since the ids were cached, and no Topic Post
	stubHomeReads([], [])
	spyOn(homeCardIds, "loadHomeCardIds").mockResolvedValue({
		homeTopicIds: [],
		homeFilmPodcastEpisodeIds: ["episode-b", "episode-a"],
		newestFilmPodcastEpisodeIds: ["episode-a"],
		homePodcastEpisodeIds: ["episode-a", "episode-gone", "episode-c"],
		newestPodcastEpisodeIds: ["episode-c", "episode-b"],
		homeTopicPostIds: [],
		newestTopicPostIds: [],
	})
	const loadPodcastEpisodeCardsSpy = spyOn(topicCards, "loadPodcastEpisodeCards").mockImplementation(
		async (podcastEpisodeIds) =>
			podcastEpisodeIds
				.filter((podcastEpisodeId) => podcastEpisodeId !== "episode-gone")
				.map((id) => ({ podcastEpisode: { id } }) as PodcastEpisodeCard),
	)
	const response = await homeRoute.request("/home")
	const home = (await response.json()) as Record<string, { podcastEpisode: { id: string } }[]>
	const toPodcastEpisodeIds = (listName: string): string[] | undefined =>
		home[listName]?.map(({ podcastEpisode }) => podcastEpisode.id)

	// each list in its ids' order, with no card for the podcast episode that is gone
	expect(toPodcastEpisodeIds("homeTopicPodcastEpisodeVideos")).toEqual(["episode-b", "episode-a"])
	expect(toPodcastEpisodeIds("newestTopicPodcastEpisodeVideos")).toEqual(["episode-a"])
	expect(toPodcastEpisodeIds("homePodcastEpisodes")).toEqual(["episode-a", "episode-c"])
	expect(toPodcastEpisodeIds("newestPodcastEpisodes")).toEqual(["episode-c", "episode-b"])

	// one read, each id once
	expect(loadPodcastEpisodeCardsSpy).toHaveBeenCalledTimes(1)
	expect(loadPodcastEpisodeCardsSpy.mock.calls[0]?.[0]).toEqual(["episode-b", "episode-a", "episode-gone", "episode-c"])
})

test("a week with no new post, and ids cached before the week's posts were read, give an empty list", async () => {
	stubHomeReads(["post-a"], [])
	expect((await loadVisitorHome()).newestTopicPosts).toEqual([])

	// ids with no list of the week's posts
	stubHomeReads(["post-a"])
	const home = await loadVisitorHome()
	expect(home.newestTopicPosts).toEqual([])
	expect(home.homeTopicPosts?.map(({ id }) => id)).toEqual(["post-a"])
})

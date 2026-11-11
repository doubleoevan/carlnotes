// podcast episode rank action tests: who sees Home podcasts, Home films, Featured podcasts, and Featured films on the
// podcast episode page
import { describe, expect, test } from "bun:test"
import type { HomePodcastEpisode } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import {
	isPodcastEpisodeHomeOrderShown,
	isPodcastEpisodeProfileOrderShown,
	isTopicPodcastEpisodeVideoHomeOrderShown,
	isTopicPodcastEpisodeVideoProfileOrderShown,
} from "./podcastEpisodeHomeOrder"

// the film of the fixture podcast episode
const FILM = { videoUrl: "https://carlnotes.com/video", captionsUrl: "https://carlnotes.com/captions" }

// the fields an admin's page holds for a podcast episode with a film on a public topic
type PageFields = Parameters<typeof isTopicPodcastEpisodeVideoHomeOrderShown>[0]
const ADMIN_PAGE: PageFields = {
	topic: { visibility: "public" } as PodcastEpisodePageResponse["topic"],
	podcastEpisode: toPodcastEpisodeFixture({ video: FILM }),
	homePodcastEpisodes: [] as HomePodcastEpisode[],
	homeTopicPodcastEpisodeVideos: [] as HomePodcastEpisode[],
}

describe("Home films", () => {
	test("shows for an admin on a public topic's podcast episode with a film", () => {
		expect(isTopicPodcastEpisodeVideoHomeOrderShown(ADMIN_PAGE)).toBe(true)
	})

	test("hides for anyone but an admin", () => {
		expect(isTopicPodcastEpisodeVideoHomeOrderShown({ ...ADMIN_PAGE, homeTopicPodcastEpisodeVideos: null })).toBe(false)
	})

	test("hides on a private topic", () => {
		const privateTopic = { visibility: "private" } as PodcastEpisodePageResponse["topic"]
		expect(isTopicPodcastEpisodeVideoHomeOrderShown({ ...ADMIN_PAGE, topic: privateTopic })).toBe(false)
	})

	test("hides for a podcast episode with no ready film", () => {
		const podcastEpisode = toPodcastEpisodeFixture({ video: null })
		expect(isTopicPodcastEpisodeVideoHomeOrderShown({ ...ADMIN_PAGE, podcastEpisode })).toBe(false)
	})
})

describe("Home podcasts", () => {
	test("shows for an admin on a public topic, with or without a film", () => {
		const podcastEpisode = toPodcastEpisodeFixture({ video: null })
		expect(isPodcastEpisodeHomeOrderShown({ ...ADMIN_PAGE, podcastEpisode })).toBe(true)
	})

	test("hides for anyone but an admin", () => {
		expect(isPodcastEpisodeHomeOrderShown({ ...ADMIN_PAGE, homePodcastEpisodes: null })).toBe(false)
	})
})

// the fields the owner's page holds for a published podcast episode with a film on a public topic
const OWNER_PAGE = {
	topic: { visibility: "public", isTopicOwner: true } as PodcastEpisodePageResponse["topic"],
	podcastEpisode: toPodcastEpisodeFixture({ video: FILM }),
}

describe("Featured films", () => {
	test("shows for the topic's owner on a public topic's published podcast episode with a film", () => {
		expect(isTopicPodcastEpisodeVideoProfileOrderShown(OWNER_PAGE)).toBe(true)
	})

	test("hides for a podcast episode with no ready film, which keeps Featured podcasts", () => {
		const audioOnlyPage = { ...OWNER_PAGE, podcastEpisode: toPodcastEpisodeFixture({ video: null }) }
		expect(isTopicPodcastEpisodeVideoProfileOrderShown(audioOnlyPage)).toBe(false)
		expect(isPodcastEpisodeProfileOrderShown(audioOnlyPage)).toBe(true)
	})

	test("hides with Featured podcasts for anyone but the owner, and on a private topic", () => {
		// the same topic as another user reads it, and as a private topic
		const otherUserTopic = { ...OWNER_PAGE.topic, isTopicOwner: false }
		const privateTopic = { ...OWNER_PAGE.topic, visibility: "private" as const }

		// neither option shows on either topic
		for (const topic of [otherUserTopic, privateTopic]) {
			expect(isTopicPodcastEpisodeVideoProfileOrderShown({ ...OWNER_PAGE, topic })).toBe(false)
			expect(isPodcastEpisodeProfileOrderShown({ ...OWNER_PAGE, topic })).toBe(false)
		}
	})
})

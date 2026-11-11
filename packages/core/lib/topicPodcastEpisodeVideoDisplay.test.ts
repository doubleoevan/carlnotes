// film section display tests: the film player for a ready film, the rendering card while a film renders, nothing for
// a failed or missing film, and the section a topic's page shows for each
import { expect, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	toTopicPagePodcastEpisodeVideoSection,
	toTopicPodcastEpisodeVideoDisplay,
} from "./topicPodcastEpisodeVideoDisplay"

// a ready film's urls
const video = { videoUrl: "/api/episodes/episode-1/video.mp4", captionsUrl: "/api/episodes/episode-1/captions.vtt" }

// a podcast episode with a ready film, one whose film is rendering, and one with no film
const readyFilmPodcastEpisode = toPodcastEpisodeFixture({ id: "episode-1", video, isVideoRendering: false })
const videoRenderingPodcastEpisode = toPodcastEpisodeFixture({ id: "episode-2", video: null, isVideoRendering: true })
const filmlessPodcastEpisode = toPodcastEpisodeFixture({ id: "episode-3", video: null, isVideoRendering: false })

// a topic whose podcast has the given film section, and the given latest podcast episode
function toFilmTopic(
	topicPodcastEpisodeVideoSection: NonNullable<TopicResponse["podcast"]>["topicPodcastEpisodeVideoSection"],
	latestPodcastEpisode: TopicResponse["latestPodcastEpisode"],
): TopicResponse {
	return toTestTopicResponse({
		latestPodcastEpisode,
		podcast: {
			isEnabled: true,
			isCommentsEnabled: true,
			hasFullPodcastEpisodes: true,
			unpublishedPodcastEpisode: null,
			publicFeedUrl: null,
			seasons: [2026],
			latestSeasonPodcastEpisodes: { podcastEpisodes: [] },
			canRemovePodcastEpisodes: false,
			topicPodcastEpisodeVideoSection,
		},
	})
}

test("a ready film shows the player, a rendering film the rendering card, and a failed or missing film nothing", () => {
	expect(toTopicPodcastEpisodeVideoDisplay(readyFilmPodcastEpisode)).toBe("player")
	expect(toTopicPodcastEpisodeVideoDisplay(videoRenderingPodcastEpisode)).toBe("rendering")
	expect(toTopicPodcastEpisodeVideoDisplay(filmlessPodcastEpisode)).toBeNull()
})

test("a ready film shows its player while it renders again, and an older api's podcast episode shows nothing", () => {
	// a ready film comes first, and a podcast episode with neither field has no film
	expect(toTopicPodcastEpisodeVideoDisplay({ video, isVideoRendering: true })).toBe("player")
	expect(toTopicPodcastEpisodeVideoDisplay({})).toBeNull()
})

test("a topic with no ready film shows an open section on its latest podcast episode while that film renders", () => {
	const topic = toFilmTopic(null, videoRenderingPodcastEpisode)
	expect(toTopicPagePodcastEpisodeVideoSection(topic)).toEqual({
		podcastEpisode: videoRenderingPodcastEpisode,
		isOpen: true,
	})
})

test("a topic keeps its ready film's section while a newer podcast episode's film renders", () => {
	// the older podcast episode's ready film stays, closed as the read resolved it
	const readyFilmSection = { podcastEpisode: readyFilmPodcastEpisode, isOpen: false }
	const topic = toFilmTopic(readyFilmSection, videoRenderingPodcastEpisode)
	expect(toTopicPagePodcastEpisodeVideoSection(topic)).toBe(readyFilmSection)
})

test("a topic with no film, a failed film, or no podcast shows no section", () => {
	expect(toTopicPagePodcastEpisodeVideoSection(toFilmTopic(null, filmlessPodcastEpisode))).toBeNull()
	expect(toTopicPagePodcastEpisodeVideoSection(toFilmTopic(null, null))).toBeNull()
	expect(toTopicPagePodcastEpisodeVideoSection(toTestTopicResponse())).toBeNull()
})

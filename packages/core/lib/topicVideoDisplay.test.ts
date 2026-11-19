// film section display tests: the film player for a ready film, the rendering card while a film renders, and nothing
// for a failed or missing film
import { expect, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTopicVideoDisplay } from "./topicVideoDisplay"

// a ready film's urls
const video = { videoUrl: "/api/episodes/episode-1/video.mp4", captionsUrl: "/api/episodes/episode-1/captions.vtt" }

// a podcast episode with a ready film, one whose film is rendering, and one with no film
const readyFilmPodcastEpisode = toPodcastEpisodeFixture({ id: "episode-1", video, isVideoRendering: false })
const videoRenderingPodcastEpisode = toPodcastEpisodeFixture({ id: "episode-2", video: null, isVideoRendering: true })
const filmlessPodcastEpisode = toPodcastEpisodeFixture({ id: "episode-3", video: null, isVideoRendering: false })

test("a ready film shows the player, a rendering film the rendering card, and a failed or missing film nothing", () => {
	expect(toTopicVideoDisplay(readyFilmPodcastEpisode)).toBe("player")
	expect(toTopicVideoDisplay(videoRenderingPodcastEpisode)).toBe("rendering")
	expect(toTopicVideoDisplay(filmlessPodcastEpisode)).toBeNull()
})

test("a ready film shows its player while it renders again, and an older api's podcast episode shows nothing", () => {
	// a ready film comes first, and a podcast episode with neither field has no film
	expect(toTopicVideoDisplay({ video, isVideoRendering: true })).toBe("player")
	expect(toTopicVideoDisplay({})).toBeNull()
})

// podcast episode editor tests: who sees Edit film on the podcast episode page and the topic page, and the image the
// film's image block opens with
import { expect, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { toPodcastEpisodeImageUrls, toTopicPodcastEpisodeVideoImageUrls } from "@carlnotes/contracts/topicImages"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	EDIT_TOPIC_PODCAST_EPISODE_VIDEO_LABEL,
	isTopicPodcastEpisodeVideoEditShown,
	type PodcastEpisodeEditorPage,
	toTopicPageEditedPodcastEpisode,
	toTopicPodcastEpisodeVideoEditableImage,
} from "./podcastEpisodeEditor"

// a film with its own image, and a podcast episode with that film and its own image
const POSTER_URL = "/api/topic-podcast-episode-video-images/episode-1/film-hash/poster.jpg"
const FILM = { videoUrl: "/api/episodes/episode-1/video.mp4", captionsUrl: "/api/episodes/episode-1/captions.vtt" }
const PODCAST_EPISODE_IMAGE = toPodcastEpisodeImageUrls("episode-1", "podcast-hash")
const FILM_PODCAST_EPISODE = toPodcastEpisodeFixture({
	image: PODCAST_EPISODE_IMAGE,
	video: { ...FILM, posterUrl: POSTER_URL },
})

// a topic whose latest film is the podcast episode's, as its editor or as a follower reads it
function toFilmTopic(canEdit: boolean): TopicResponse {
	const podcast = { topicPodcastEpisodeVideoSection: { podcastEpisode: FILM_PODCAST_EPISODE, isOpen: true } }
	return toTestTopicResponse({ canEdit, podcast: podcast as TopicResponse["podcast"] })
}

test("the option and the dialog read Edit film", () => {
	expect(EDIT_TOPIC_PODCAST_EPISODE_VIDEO_LABEL).toBe("Edit film")
})

test("Edit film shows for a user who may edit a podcast episode with a ready film", () => {
	expect(
		isTopicPodcastEpisodeVideoEditShown({ canEditPodcastEpisode: true, podcastEpisode: FILM_PODCAST_EPISODE }),
	).toBe(true)
})

test("Edit film hides for a user who may not edit, and for a podcast episode with no ready film", () => {
	const audioOnlyPodcastEpisode = toPodcastEpisodeFixture({ video: null })
	expect(
		isTopicPodcastEpisodeVideoEditShown({ canEditPodcastEpisode: false, podcastEpisode: FILM_PODCAST_EPISODE }),
	).toBe(false)
	expect(
		isTopicPodcastEpisodeVideoEditShown({ canEditPodcastEpisode: true, podcastEpisode: audioOnlyPodcastEpisode }),
	).toBe(false)
	expect(isTopicPodcastEpisodeVideoEditShown({ canEditPodcastEpisode: true, podcastEpisode: null })).toBe(false)
})

test("a topic page's Edit film edits the topic's latest film, for the topic's editor alone", () => {
	expect(toTopicPageEditedPodcastEpisode(toFilmTopic(true))).toBe(FILM_PODCAST_EPISODE)
	expect(toTopicPageEditedPodcastEpisode(toFilmTopic(false))).toBeNull()
	expect(toTopicPageEditedPodcastEpisode(toTestTopicResponse({ canEdit: true, podcast: null }))).toBeNull()
})

// the page fields of the podcast episode for an admin, who has no regeneration count
function toEditorPage(podcastEpisode: PodcastEpisodeEditorPage["podcastEpisode"]): PodcastEpisodeEditorPage {
	return {
		podcastEpisode,
		topic: { name: "Home espresso" },
		podcastEpisodeImageOrigin: "generated",
		podcastEpisodeImagePrompt: null,
		topicPodcastEpisodeVideoImageOrigin: "generated",
		topicPodcastEpisodeVideoImagePrompt: "a film set at dawn",
		imageRegenerationQuota: null,
	}
}

test("the film's image block opens with the film's own image and its image prompt", () => {
	expect(toTopicPodcastEpisodeVideoEditableImage(toEditorPage(FILM_PODCAST_EPISODE))).toMatchObject({
		kind: "topicPodcastEpisodeVideo",
		id: FILM_PODCAST_EPISODE.id,
		image: toTopicPodcastEpisodeVideoImageUrls(POSTER_URL),
		imagePrompt: "a film set at dawn",
	})
})

test("a film with no image of its own opens with the podcast episode's image", () => {
	const podcastEpisode = { ...FILM_PODCAST_EPISODE, video: { ...FILM, posterUrl: null } }
	expect(toTopicPodcastEpisodeVideoEditableImage(toEditorPage(podcastEpisode)).image).toEqual(PODCAST_EPISODE_IMAGE)
})

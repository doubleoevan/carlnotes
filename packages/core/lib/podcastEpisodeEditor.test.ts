// podcast episode editor tests: who sees Edit film on the podcast episode page and the topic page, which podcast
// episode a topic page's Edit podcast edits, the image the film's image block opens with, and which image block
// reads an unchecked image's flag
import { expect, test } from "bun:test"
import { toPodcastEpisodeFixture, toTopicPodcastFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { toPodcastEpisodeImageUrls, toTopicVideoImageUrls } from "@carlnotes/contracts/topicImages"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	EDIT_TOPIC_VIDEO_LABEL,
	isTopicVideoEditShown,
	type PodcastEpisodeEditorPage,
	toPodcastEpisodeEditableImage,
	toTopicPageEditablePodcastEpisodes,
	toTopicVideoEditableImage,
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
	const podcast = toTopicPodcastFixture({ topicPodcastEpisodeVideoSection: { podcastEpisode: FILM_PODCAST_EPISODE } })
	return toTestTopicResponse({ canEdit, podcast })
}

test("the option and the dialog read Edit film", () => {
	expect(EDIT_TOPIC_VIDEO_LABEL).toBe("Edit film")
})

test("Edit film shows for a user who may edit a podcast episode with a ready film", () => {
	expect(isTopicVideoEditShown({ canEditPodcastEpisode: true, podcastEpisode: FILM_PODCAST_EPISODE })).toBe(true)
})

test("Edit film hides for a user who may not edit, and for a podcast episode with no ready film", () => {
	const audioOnlyPodcastEpisode = toPodcastEpisodeFixture({ video: null })
	expect(isTopicVideoEditShown({ canEditPodcastEpisode: false, podcastEpisode: FILM_PODCAST_EPISODE })).toBe(false)
	expect(isTopicVideoEditShown({ canEditPodcastEpisode: true, podcastEpisode: audioOnlyPodcastEpisode })).toBe(false)
	expect(isTopicVideoEditShown({ canEditPodcastEpisode: true, podcastEpisode: null })).toBe(false)
})

test("a topic page's Edit film edits the topic's latest film, for the topic's editor alone", () => {
	expect(toTopicPageEditablePodcastEpisodes(toFilmTopic(true)).topicVideoPodcastEpisode).toBe(FILM_PODCAST_EPISODE)
	expect(toTopicPageEditablePodcastEpisodes(toFilmTopic(false)).topicVideoPodcastEpisode).toBeNull()
	const noPodcastTopic = toTestTopicResponse({ canEdit: true, podcast: null })
	expect(toTopicPageEditablePodcastEpisodes(noPodcastTopic).topicVideoPodcastEpisode).toBeNull()
})

test("a topic page's Edit podcast edits the topic's latest podcast episode, for the topic's editor alone", () => {
	const latestPodcastEpisode = toPodcastEpisodeFixture({ video: null })
	const toLatestPodcastEpisodeTopic = (canEdit: boolean): TopicResponse =>
		toTestTopicResponse({ canEdit, latestPodcastEpisode })
	expect(toTopicPageEditablePodcastEpisodes(toLatestPodcastEpisodeTopic(true)).latestPodcastEpisode).toBe(
		latestPodcastEpisode,
	)
	expect(toTopicPageEditablePodcastEpisodes(toLatestPodcastEpisodeTopic(false)).latestPodcastEpisode).toBeNull()
	const noPodcastEpisodeTopic = toTestTopicResponse({ canEdit: true, latestPodcastEpisode: null })
	expect(toTopicPageEditablePodcastEpisodes(noPodcastEpisodeTopic).latestPodcastEpisode).toBeNull()
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
	expect(toTopicVideoEditableImage(toEditorPage(FILM_PODCAST_EPISODE))).toMatchObject({
		kind: "topicVideo",
		id: FILM_PODCAST_EPISODE.id,
		image: toTopicVideoImageUrls(POSTER_URL),
		imagePrompt: "a film set at dawn",
	})
})

test("a film with no image of its own opens with the podcast episode's image", () => {
	const podcastEpisode = { ...FILM_PODCAST_EPISODE, video: { ...FILM, posterUrl: null } }
	expect(toTopicVideoEditableImage(toEditorPage(podcastEpisode)).image).toEqual(PODCAST_EPISODE_IMAGE)
})

test("each image block reads whether its own image is unchecked, and not the other's", () => {
	const uncheckedTopicVideoImagePage = {
		...toEditorPage(FILM_PODCAST_EPISODE),
		isTopicVideoImageUnchecked: true,
	}
	expect(toTopicVideoEditableImage(uncheckedTopicVideoImagePage).isImageUnchecked).toBe(true)
	expect(toPodcastEpisodeEditableImage(uncheckedTopicVideoImagePage).isImageUnchecked).toBeUndefined()
})

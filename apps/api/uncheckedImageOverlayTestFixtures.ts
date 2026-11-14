// the unchecked image overlay tests' fixtures: a published podcast episode with its own image and a ready film with its
// own poster, one editor's unchecked uploads over both, and the podcast episode as that editor reads it. only tests
// import it

import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import {
	toPodcastEpisodeImageUrls,
	toTopicPodcastEpisodeVideoPosterUrl,
	toUncheckedTopicImageUrls,
} from "@carlnotes/contracts/topicImages"
import { toUncheckedImagePath } from "@carlnotes/contracts/uncheckedImages"

// the ready film of episode-1, with the poster of its own published image
const PUBLISHED_POSTER_URL = toTopicPodcastEpisodeVideoPosterUrl("episode-1", "published-poster-hash")
const TOPIC_PODCAST_EPISODE_VIDEO = {
	videoUrl: "/api/episodes/episode-1/video.mp4",
	captionsUrl: "/api/episodes/episode-1/captions.vtt",
	posterUrl: PUBLISHED_POSTER_URL,
}

// episode-1 as everyone reads it: its published image, and its ready film with the film's published poster
export const PUBLISHED_PODCAST_EPISODE: PodcastEpisode = toPodcastEpisodeFixture({
	id: "episode-1",
	image: toPodcastEpisodeImageUrls("episode-1", "published-hash"),
	hasVideo: true,
	videoPosterUrl: PUBLISHED_POSTER_URL,
	video: TOPIC_PODCAST_EPISODE_VIDEO,
})

// the unchecked uploads under episode-1's id as the unchecked images read selects them, each by its kind and its
// content hash: the podcast episode's own image, and its film's
export const UNCHECKED_PODCAST_EPISODE_IMAGE_ROW = ["podcastEpisodeImage", "unchecked-hash"]
export const UNCHECKED_TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_ROW = [
	"topicPodcastEpisodeVideoImage",
	"unchecked-poster-hash",
]

// episode-1 as the editor who uploaded both unchecked images reads it, with each upload in its published image's place
// at a url marked as an unchecked image's
const UNCHECKED_POSTER_URL = toUncheckedImagePath(
	toTopicPodcastEpisodeVideoPosterUrl("episode-1", "unchecked-poster-hash"),
)
export const UNCHECKED_PODCAST_EPISODE: PodcastEpisode = {
	...PUBLISHED_PODCAST_EPISODE,
	image: toUncheckedTopicImageUrls(toPodcastEpisodeImageUrls("episode-1", "unchecked-hash")),
	videoPosterUrl: UNCHECKED_POSTER_URL,
	video: { ...TOPIC_PODCAST_EPISODE_VIDEO, posterUrl: UNCHECKED_POSTER_URL },
}

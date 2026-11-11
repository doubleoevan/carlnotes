// the film's section of a topic's info: shown only for a ready film, with the poster's play button in the row's
// play button's place and the topic info as the section its press reports
import { expect, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { isValidElement, type ReactElement } from "react"
import type { PodcastEpisodeRowProps } from "./PodcastEpisodeRow"
import type { PodcastEpisodeVideoButtonProps } from "./PodcastEpisodeVideoButton"
import type { TopicInfoSectionProps } from "./TopicInfoSection"
import {
	TopicPodcastEpisodeVideoInfoSection,
	type TopicPodcastEpisodeVideoInfoSectionElements,
} from "./TopicPodcastEpisodeVideoInfoSection"

// elements that render nothing, so the test reads the tree the shared section returns
const ELEMENTS: TopicPodcastEpisodeVideoInfoSectionElements = {
	Section: () => null,
	Row: () => null,
	VideoButton: () => null,
}

// the film's own poster, and a latest podcast episode with a ready film that has it
const POSTER_URL = "/api/topic-podcast-episode-video-images/episode-1/hash-1/poster.jpg"
const PODCAST_EPISODE = toPodcastEpisodeFixture({
	hasVideo: true,
	video: {
		videoUrl: "/api/episodes/episode-1/video.mp4",
		captionsUrl: "/api/episodes/episode-1/captions.vtt",
		posterUrl: POSTER_URL,
	},
})

test("a latest podcast episode with a ready film shows the film's row under its label", () => {
	const section = TopicPodcastEpisodeVideoInfoSection({ podcastEpisode: PODCAST_EPISODE, elements: ELEMENTS })

	// the labeled section holds the one row, on the podcast episode and its page
	const { label, children: row } = (section as ReactElement<TopicInfoSectionProps>).props
	expect(label).toBe("Coffee Break film")
	const rowProps = (row as ReactElement<PodcastEpisodeRowProps>).props
	expect(rowProps.podcastEpisode).toBe(PODCAST_EPISODE)
	expect(rowProps.podcastEpisodePath).toBe(PODCAST_EPISODE.pagePath)

	// the poster's play button takes the play button's place and reports the topic info
	const videoButton = rowProps.playButton as ReactElement<PodcastEpisodeVideoButtonProps>
	expect(isValidElement(videoButton) && videoButton.type).toBe(ELEMENTS.VideoButton)
	expect(videoButton.props).toEqual({
		podcastEpisode: PODCAST_EPISODE,
		label: "Play film",
		surface: "topic-info",
		size: "thumbnail",
		posterUrl: POSTER_URL,
	})
})

test("a film with no image of its own shows the podcast episode's cover as its poster", () => {
	const podcastEpisode = toPodcastEpisodeFixture({
		coverUrl: "/api/podcast-covers/episode-1.jpg",
		video: { videoUrl: "/api/episodes/episode-1/video.mp4", captionsUrl: "/api/episodes/episode-1/captions.vtt" },
	})
	const section = TopicPodcastEpisodeVideoInfoSection({ podcastEpisode, elements: ELEMENTS })
	const { children: row } = (section as ReactElement<TopicInfoSectionProps>).props
	const videoButton = (row as ReactElement<PodcastEpisodeRowProps>).props.playButton
	expect((videoButton as ReactElement<PodcastEpisodeVideoButtonProps>).props.posterUrl).toBe(
		"/api/podcast-covers/episode-1.jpg",
	)
})

test("no latest podcast episode, or one with no ready film, shows no film section", () => {
	const podcastEpisodes = [null, toPodcastEpisodeFixture(), toPodcastEpisodeFixture({ hasVideo: false, video: null })]
	for (const podcastEpisode of podcastEpisodes) {
		expect(TopicPodcastEpisodeVideoInfoSection({ podcastEpisode, elements: ELEMENTS })).toBeNull()
	}
})

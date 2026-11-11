import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import {
	PODCAST_STORY_EPISODE,
	PODCAST_STORY_FILM_EPISODE,
	PodcastEpisodeStory,
} from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { type ComponentRef, useRef } from "react"
import { ScrollView } from "react-native"
import { TopicPodcastEpisodeVideoSection } from "./TopicPodcastEpisodeVideoSection"

// a topic whose Topic Cinema opens or stays collapsed on the latest film
function toFilmTopic(isOpen: boolean): ReturnType<typeof toTestTopicResponse> {
	return toTestTopicResponse({
		podcast: {
			isEnabled: true,
			isCommentsEnabled: true,
			hasFullPodcastEpisodes: true,
			unpublishedPodcastEpisode: null,
			publicFeedUrl: null,
			seasons: [2026],
			latestSeasonPodcastEpisodes: { podcastEpisodes: [PODCAST_STORY_FILM_EPISODE] },
			canRemovePodcastEpisodes: false,
			topicPodcastEpisodeVideoSection: { podcastEpisode: PODCAST_STORY_FILM_EPISODE, isOpen },
		},
	})
}

// a topic with no ready film, whose latest podcast episode's film is rendering
const VIDEO_RENDERING_TOPIC = toTestTopicResponse({
	podcast: {
		isEnabled: true,
		isCommentsEnabled: true,
		hasFullPodcastEpisodes: true,
		unpublishedPodcastEpisode: null,
		publicFeedUrl: null,
		seasons: [2026],
		latestSeasonPodcastEpisodes: { podcastEpisodes: [PODCAST_STORY_EPISODE] },
		canRemovePodcastEpisodes: false,
		topicPodcastEpisodeVideoSection: null,
	},
	latestPodcastEpisode: { ...PODCAST_STORY_EPISODE, isVideoRendering: true },
})

// the section inside the scroll view that a row's play scrolls
function TopicPodcastEpisodeVideoSectionStory({ topic }: { topic: ReturnType<typeof toTestTopicResponse> }) {
	const scrollViewRef = useRef<ComponentRef<typeof ScrollView>>(null)
	return (
		<PodcastEpisodeStory episode={PODCAST_STORY_FILM_EPISODE}>
			<ScrollView ref={scrollViewRef} className="w-full" contentContainerClassName="px-4">
				<TopicPodcastEpisodeVideoSection topic={topic} onVideoRenderingPoll={() => {}} scrollViewRef={scrollViewRef} />
			</ScrollView>
		</PodcastEpisodeStory>
	)
}

const meta = {
	title: "Podcast/TopicPodcastEpisodeVideoSection",
	component: TopicPodcastEpisodeVideoSectionStory,
	args: { topic: toFilmTopic(true) },
	parameters: { webReference: "apps/web/src/components/podcast/TopicPodcastEpisodeVideoSection.tsx at 375px" },
} satisfies Meta<typeof TopicPodcastEpisodeVideoSectionStory>
export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {}
export const Collapsed: Story = { args: { topic: toFilmTopic(false) } }
export const VideoRendering: Story = { args: { topic: VIDEO_RENDERING_TOPIC } }

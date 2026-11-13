import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	PODCAST_STORY_FILM_EPISODE,
	PODCAST_STORY_FILM_TOPIC,
	PODCAST_STORY_NEWER_VIDEO_RENDERING_TOPIC,
	PODCAST_STORY_VIDEO_RENDERING_TOPIC,
	PodcastEpisodeStory,
} from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { type ComponentRef, useRef } from "react"
import { ScrollView } from "react-native"
import { TopicPodcastEpisodeVideoSection } from "./TopicPodcastEpisodeVideoSection"

// the section inside the scroll view that a row's play scrolls
function TopicPodcastEpisodeVideoSectionStory({ topic }: { topic: TopicResponse }) {
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
	args: { topic: PODCAST_STORY_FILM_TOPIC },
	parameters: { webReference: "apps/web/src/components/podcast/TopicPodcastEpisodeVideoSection.tsx at 375px" },
} satisfies Meta<typeof TopicPodcastEpisodeVideoSectionStory>
export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {}
export const VideoRendering: Story = { args: { topic: PODCAST_STORY_VIDEO_RENDERING_TOPIC } }
export const NewerVideoRendering: Story = { args: { topic: PODCAST_STORY_NEWER_VIDEO_RENDERING_TOPIC } }

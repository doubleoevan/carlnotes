import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	PODCAST_STORY_FILM_EPISODE,
	PODCAST_STORY_FILM_TOPIC,
	PODCAST_STORY_NEWER_VIDEO_RENDERING_TOPIC,
	PODCAST_STORY_VIDEO_RENDERING_TOPIC,
	PodcastEpisodeStory,
} from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { TopicVideoSection } from "./TopicVideoSection"

// the section inside the topic screen's side insets
function TopicVideoSectionStory({ topic }: { topic: TopicResponse }) {
	return (
		<PodcastEpisodeStory episode={PODCAST_STORY_FILM_EPISODE}>
			<ScrollView className="w-full" contentContainerClassName="px-4">
				<TopicVideoSection topic={topic} onVideoRenderingPoll={() => {}} />
			</ScrollView>
		</PodcastEpisodeStory>
	)
}

const meta = {
	title: "Podcast/TopicVideoSection",
	component: TopicVideoSectionStory,
	args: { topic: PODCAST_STORY_FILM_TOPIC },
	parameters: { webReference: "apps/web/src/components/podcast/TopicVideoSection.tsx at 375px" },
} satisfies Meta<typeof TopicVideoSectionStory>
export default meta
type Story = StoryObj<typeof meta>

// eight films as cards, six to a page
export const Open: Story = {}
// the filming card alone, for a topic with no ready film
export const VideoRendering: Story = { args: { topic: PODCAST_STORY_VIDEO_RENDERING_TOPIC } }
// the filming card above the ready films' cards
export const NewerVideoRendering: Story = { args: { topic: PODCAST_STORY_NEWER_VIDEO_RENDERING_TOPIC } }

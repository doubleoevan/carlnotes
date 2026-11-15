import {
	PODCAST_STORY_FILM_EPISODE,
	PODCAST_STORY_FILM_TOPIC,
	PODCAST_STORY_NEWER_VIDEO_RENDERING_TOPIC,
	PODCAST_STORY_VIDEO_RENDERING_TOPIC,
	PodcastEpisodeStory,
} from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TopicVideoSection } from "./TopicVideoSection"

const meta: Meta<typeof TopicVideoSection> = {
	title: "Podcast/TopicVideoSection",
	component: TopicVideoSection,
	args: { topic: PODCAST_STORY_FILM_TOPIC, onVideoRenderingPoll: () => {} },
	parameters: { webReference: "apps/web/src/components/podcast/TopicVideoSection.tsx at 375px" },
	decorators: [
		(Story) => (
			<PodcastEpisodeStory episode={PODCAST_STORY_FILM_EPISODE}>
				<div className="max-w-3xl">
					<Story />
				</div>
			</PodcastEpisodeStory>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {}
export const VideoRendering: Story = { args: { topic: PODCAST_STORY_VIDEO_RENDERING_TOPIC } }
export const NewerVideoRendering: Story = { args: { topic: PODCAST_STORY_NEWER_VIDEO_RENDERING_TOPIC } }

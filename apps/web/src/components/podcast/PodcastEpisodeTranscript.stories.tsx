import { PODCAST_STORY_TRANSCRIPT } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { PodcastEpisodeTranscript } from "./PodcastEpisodeTranscript"

const meta: Meta<typeof PodcastEpisodeTranscript> = {
	title: "Podcast/PodcastEpisodeTranscript",
	component: PodcastEpisodeTranscript,
	args: { transcript: PODCAST_STORY_TRANSCRIPT },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Empty: Story = { args: { transcript: [] } }

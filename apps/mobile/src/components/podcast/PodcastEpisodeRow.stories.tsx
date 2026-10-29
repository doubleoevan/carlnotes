import type { Meta, StoryObj } from "@storybook/react-native"
import { STORY_PODCAST_EPISODE } from "@/components/topic/topicPageStories"
import { PodcastEpisodeRow } from "./PodcastEpisodeRow"

// compare the same named web component at phone width
const meta: Meta<typeof PodcastEpisodeRow> = {
	title: "Podcast/PodcastEpisodeRow",
	component: PodcastEpisodeRow,
	parameters: { webReference: "apps/web/src/components/podcast/PodcastEpisodeRow.tsx at 375px", surface: "card" },
	args: { podcastEpisode: STORY_PODCAST_EPISODE },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Latest: Story = { args: { isLatestPodcastEpisode: true } }

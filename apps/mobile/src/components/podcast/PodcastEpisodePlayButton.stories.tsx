import type { Meta, StoryObj } from "@storybook/react-native"
import { STORY_PODCAST_EPISODE } from "@/components/topic/topicPageStories"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"

// compare the same named web component at phone width
const meta: Meta<typeof PodcastEpisodePlayButton> = {
	title: "Podcast/PodcastEpisodePlayButton",
	component: PodcastEpisodePlayButton,
	parameters: {
		webReference: "apps/web/src/components/podcast/PodcastEpisodePlayButton.tsx at 375px",
		surface: "card",
	},
	args: { episode: STORY_PODCAST_EPISODE },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Large: Story = { args: { size: "lg" } }
export const EpisodeRow: Story = { args: { size: "default" } }

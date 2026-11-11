import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { PodcastEpisodeSkeleton } from "./PodcastEpisodeSkeleton"

// compare the podcast episode page's loading state with the loaded page in the same theme and viewport
const meta = {
	title: "Podcast/PodcastEpisodeSkeleton",
	component: PodcastEpisodeSkeleton,
} satisfies Meta<typeof PodcastEpisodeSkeleton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { UnpublishedPodcastEpisodeCard } from "./UnpublishedPodcastEpisodeCard"

const meta: Meta<typeof UnpublishedPodcastEpisodeCard> = {
	title: "Podcast/UnpublishedPodcastEpisodeCard",
	component: UnpublishedPodcastEpisodeCard,
	args: { podcastEpisode: null },
}
export default meta
type Story = StoryObj<typeof meta>
export const Recording: Story = {}
export const Failed: Story = {
	args: { podcastEpisode: { status: "failed", title: "Better beans, better mornings", smallCoverUrl: null } },
}

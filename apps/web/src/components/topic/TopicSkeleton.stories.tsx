import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { PodcastEpisodePlayerCardSkeleton, TopicSkeleton, TopicVideoCardSkeleton } from "./TopicSkeleton"

// compare the shared Topic loading composition before data arrives and with a known title, in the loaded page's own
// header grid and sections
const meta = {
	title: "Topic/TopicSkeleton",
	component: TopicSkeleton,
} satisfies Meta<typeof TopicSkeleton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const KnownTopic: Story = { args: { topicTitle: "Better coffee at home" } }
// the film player's card on the podcast episode page
export const FilmCard: Story = { render: () => <TopicVideoCardSkeleton /> }
// the player card as the podcast episode page shows it, and with the podcast feed button of the topic page's card
export const PlayerCard: Story = { render: () => <PodcastEpisodePlayerCardSkeleton /> }
export const PlayerCardWithFeedButton: Story = { render: () => <PodcastEpisodePlayerCardSkeleton hasFeedButton /> }

// the rating block: the box that tells Carl why, with the thumbs that set the rating and send the words on its right
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TopicFindingRating } from "./TopicFindingRating"

const meta = {
	title: "Topic/TopicFindingRating",
	component: TopicFindingRating,
	args: { findingId: "finding-example", rating: null, onRateTopicFinding: () => {} },
} satisfies Meta<typeof TopicFindingRating>

export default meta
type Story = StoryObj<typeof meta>

// no rating yet, with the box's placeholder showing
export const Unrated: Story = {}

// a thumb already pressed
export const Rated: Story = { args: { rating: "up" } }

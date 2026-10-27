import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TopicSkeleton } from "./TopicSkeleton"

// compare the shared Topic loading composition before data arrives and with a known title
const meta = {
	title: "Topic/TopicSkeleton",
	component: TopicSkeleton,
} satisfies Meta<typeof TopicSkeleton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const KnownTopic: Story = { args: { topicTitle: "Better coffee at home" } }

import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"
import { TopicFeedSkeleton } from "./TopicFeedSkeleton"

// compare the loading shapes with Home's open section and the closed sections under it
const meta = {
	title: "Topic/TopicFeedSkeleton",
	component: TopicFeedSkeleton,
} satisfies Meta<typeof TopicFeedSkeleton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Phone: Story = { globals: PHONE_VIEWPORT_GLOBALS }

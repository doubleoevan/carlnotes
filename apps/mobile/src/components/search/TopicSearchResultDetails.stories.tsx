import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicSearchResultDetails } from "./TopicSearchResultDetails"

const meta = {
	title: "Search/TopicSearchResultDetails",
	component: TopicSearchResultDetails,
	args: { viewerCount: 11, subscriberCount: 8 },
} satisfies Meta<typeof TopicSearchResultDetails>
export default meta
type Story = StoryObj<typeof meta>
export const WithCounts: Story = {}
export const ZeroCounts: Story = { args: { viewerCount: 0, subscriberCount: 0 } }
export const WithoutCounts: Story = { args: { viewerCount: undefined, subscriberCount: undefined } }

import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicFeedStatus } from "./TopicFeedStatus"

// match the web Feed's loading and retry areas
const meta = {
	title: "Topic/TopicFeedStatus",
	component: TopicFeedStatus,
	parameters: { webReference: "apps/web/src/pages/HomePage.tsx at 375px" },
	args: { topicLabel: "topics", onRetry: () => undefined },
} satisfies Meta<typeof TopicFeedStatus>
export default meta
type Story = StoryObj<typeof meta>
export const Loading: Story = { args: { isLoading: true } }
export const LoadingTopic: Story = { args: { isLoading: true, topicLabel: "topic" } }
export const FailedRefresh: Story = { args: { hasError: true, hasContent: true } }
export const FailedInitialLoad: Story = { args: { hasError: true } }

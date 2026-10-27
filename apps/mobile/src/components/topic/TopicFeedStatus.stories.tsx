import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicFeedStatus } from "./TopicFeedStatus"
import { STORY_TOPIC_PAGE } from "./topicPageStories"

// keep the complete route loading area available for device review without changing network speed
const meta = {
	title: "Topic/TopicFeedStatus",
	component: TopicFeedStatus,
	parameters: { webReference: "apps/web/src/components/topic/TopicSkeleton.stories.tsx" },
	args: { topicLabel: "topic", isLoading: true, onRetry: () => {} },
} satisfies Meta<typeof TopicFeedStatus>
export default meta
type Story = StoryObj<typeof meta>
export const LoadingTopic: Story = {}
export const KnownTopic: Story = { args: { topicPreview: STORY_TOPIC_PAGE } }
export const FailedTopic: Story = { args: { isLoading: false, hasError: true } }
export const RefreshFailed: Story = { args: { isLoading: false, hasError: true, hasContent: true } }

// a signed-in user's finding controls: the rating block over the bookmark and read toggles
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TopicFindingControls } from "./TopicFindingControls"

const meta = {
	title: "Topic/TopicFindingControls",
	component: TopicFindingControls,
	args: {
		resource: { findingId: "finding-example", rating: null, isBookmarked: false, isConsumed: false },
		isRatable: true,
		isBookmarkable: true,
		topicFeedHandlers: { rateTopicFinding: () => {}, bookmarkTopicFinding: () => {}, consumeTopicFinding: () => {} },
	},
} satisfies Meta<typeof TopicFindingControls>

export default meta
type Story = StoryObj<typeof meta>

// an owner's finding, unrated and unread
export const Owner: Story = {}

// a follower rates and marks read, and cannot bookmark
export const Follower: Story = { args: { isBookmarkable: false } }

// a user who cannot rate or bookmark gets the read toggle alone
export const ReadToggleOnly: Story = { args: { isRatable: false, isBookmarkable: false } }

// an MCP view's read toggle, which stays disabled once the finding is read
export const ReadOnce: Story = {
	args: {
		resource: { findingId: "finding-example", rating: "up", isBookmarked: true, isConsumed: true },
		canMarkUnread: false,
	},
}

// the topic post MCP view: a published Topic Post with its discussion's player and its comment thread. its reactions
// and its thread call their tools through the host. a story has no host
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import { toTestCommentThread } from "@carlnotes/contracts/socialTestFixtures"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { TOPIC_POST_DISCUSSION_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { setMcpViewData } from "./mcpViewHost"
import { TopicPostMcpView } from "./TopicPostMcpView"

// a published post with a recording, as a tool result gives it to the MCP view, with its thread's first page
const TOPIC_POST_STORY: TopicPostResponse = { ...TOPIC_POST_DISCUSSION_STORY, commentThread: toTestCommentThread() }

// the MCP view data of a visitor's read and of a user's
const VISITOR_MCP_VIEW_DATA: McpViewData = { session: null, podcastEpisodes: [] }
const USER_MCP_VIEW_DATA: McpViewData = {
	session: { userId: "user-vienna", username: "vienna", avatarSource: null, avatarVersion: null },
	podcastEpisodes: [],
}

const meta = {
	title: "MCP Apps/MCP views/TopicPostMcpView",
	component: TopicPostMcpView,
	args: { topicPost: TOPIC_POST_STORY },
	parameters: { surface: "page" },
} satisfies Meta<typeof TopicPostMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's MCP view: the post, its discussion, and its thread, with no Regenerate
export const Visitor: Story = {
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: VISITOR_MCP_VIEW_DATA }),
	parameters: { session: "visitor" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading", { level: 1, name: /Light roasts, ranked/ })).toBeVisible()
		await expect(canvas.getByText("Coffee Break Discussion")).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Regenerate" })).toBeNull()
	},
}

// a user's MCP view, whose reactions and composer save through their tools
export const SignedIn: Story = {
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: USER_MCP_VIEW_DATA }),
	parameters: { session: "user" },
}

// a post with no recording shows no discussion card
export const WithoutDiscussion: Story = {
	...SignedIn,
	args: { topicPost: { ...TOPIC_POST_STORY, discussion: null } },
	play: async ({ canvas }) => {
		await expect(canvas.queryByText("Coffee Break Discussion")).toBeNull()
	},
}

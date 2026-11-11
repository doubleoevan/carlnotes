// the news MCP view: the caller's unseen Comment Mentions, then the news the tool read, with the window picker and the
// pages. a window and a page past the tool result call the tool through the host. a story has no host
import { MCP_VIEW_META_KEY, type McpViewNews } from "@carlnotes/contracts/mcpViews"
import { COMMENT_MENTION_STORIES } from "@carlnotes/core/lib/commentMentionStories"
import { toNewsStoryPage } from "@carlnotes/core/lib/newsStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { VISITOR_TOOL_RESULT } from "../../.storybook/fixtures/mcpViews"
import { McpViewToolText } from "./McpViewToolText"
import { setMcpViewData } from "./mcpViewHost"
import { NewsMcpView } from "./NewsMcpView"

// the week's first twenty News Events, as one tool result holds them, with three unseen mentions
const NEWS_STORY: McpViewNews = {
	window: "week",
	commentMentions: COMMENT_MENTION_STORIES,
	newsPage: { ...toNewsStoryPage(1), newsEvents: [1, 2, 3, 4].flatMap((page) => toNewsStoryPage(page).newsEvents) },
	nextCursor: "story-cursor",
}

// the MCP view data of the news of the user whose hot take the story's reactions are on
const USER_NEWS_MCP_VIEW_DATA = {
	session: { userId: "user-evan", username: "Evan", avatarSource: null, avatarVersion: null },
	podcastEpisodes: NEWS_STORY.newsPage.podcastEpisodes,
}

const meta = {
	title: "MCP Apps/MCP views/NewsMcpView",
	component: NewsMcpView,
	args: { news: NEWS_STORY },
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: USER_NEWS_MCP_VIEW_DATA }),
	parameters: { session: "user", surface: "page" },
} satisfies Meta<typeof NewsMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a user's news: the mentions first with no action that marks them seen, then the week's rows five to a page
export const SignedIn: Story = {
	play: async ({ canvas }) => {
		await expect(await canvas.findByText("12 reactions on your hot take")).toBeVisible()
		await expect(canvas.getByRole("heading", { name: "Mentions" })).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Mark all seen" })).toBeNull()
		await expect(canvas.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true")
		await expect(canvas.queryByRole("button", { name: "Topic details" })).toBeNull()
	},
}

// a user nobody mentioned sees the news alone
export const WithoutMentions: Story = { args: { news: { ...NEWS_STORY, commentMentions: [] } } }

// a visitor's call returns only the tool's words
export const Visitor: Story = {
	parameters: { session: "visitor" },
	render: () => <McpViewToolText toolResult={VISITOR_TOOL_RESULT} />,
}

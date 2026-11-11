// the topic posts MCP view: a Topic's published Topic Posts as cards under the Topic's header. a card's press reads
// its post through the host. a story has no host
import { MCP_VIEW_META_KEY, type McpViewData, type McpViewTopic } from "@carlnotes/contracts/mcpViews"
import { TOPIC_POST_CARD_STORY } from "@carlnotes/core/lib/topicPostStories"
import { TOPIC_POST_LABELS } from "@carlnotes/core/lib/topicPosts"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { setMcpViewData } from "./mcpViewHost"
import { TopicPostsMcpView } from "./TopicPostsMcpView"

// the Topic the cards sit under, as a visitor reads it and as a user who does not follow it yet does
const VISITOR_TOPIC: McpViewTopic = {
	id: TOPIC_POST_CARD_STORY.topicId,
	name: TOPIC_POST_CARD_STORY.topicName,
	prompt: "Grinders, burrs, and what changes the cup.",
	visibility: "public",
	latestPodcastEpisode: null,
	image: null,
	isSubscribed: null,
	canRate: false,
	canBookmark: false,
}
const USER_TOPIC: McpViewTopic = { ...VISITOR_TOPIC, isSubscribed: false, canRate: true, canBookmark: true }

// the MCP view data of a visitor's read and of a user's
const VISITOR_MCP_VIEW_DATA: McpViewData = { session: null, podcastEpisodes: [] }
const USER_MCP_VIEW_DATA: McpViewData = {
	session: { userId: "user-vienna", username: "vienna", avatarSource: null, avatarVersion: null },
	podcastEpisodes: [],
}

// two published posts, newest first
const TOPIC_POSTS_STORY = [
	TOPIC_POST_CARD_STORY,
	{
		...TOPIC_POST_CARD_STORY,
		id: "post-3",
		title: "The grinder is the machine",
		publishedAt: "2026-10-20T16:00:00.000Z",
		summary: null,
		reactionCount: 0,
		path: "/topics/topic-1/home-espresso/posts/post-3/the-grinder-is-the-machine",
	},
]

const meta = {
	title: "MCP Apps/MCP views/TopicPostsMcpView",
	component: TopicPostsMcpView,
	args: { topicPosts: TOPIC_POSTS_STORY, hasMoreTopicPosts: false },
	parameters: { surface: "page" },
} satisfies Meta<typeof TopicPostsMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's MCP view: the cards under the Topic's name, with no Follow and no button that starts a draft
export const Visitor: Story = {
	args: { topic: VISITOR_TOPIC },
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: VISITOR_MCP_VIEW_DATA }),
	parameters: { session: "visitor" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("link", { name: `Open ${TOPIC_POST_CARD_STORY.title}` })).toBeVisible()
		await expect(canvas.queryByRole("button", { name: TOPIC_POST_LABELS.newPost })).toBeNull()
	},
}

// a user's MCP view, with Follow beside the Topic's name
export const SignedIn: Story = {
	args: { topic: USER_TOPIC },
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: USER_MCP_VIEW_DATA }),
	parameters: { session: "user" },
}

// a Topic with no post shows the section's empty line, and still no button that starts a draft
export const Empty: Story = {
	...SignedIn,
	args: { ...SignedIn.args, topicPosts: [] },
	play: async ({ canvas }) => {
		await expect(canvas.getByText(TOPIC_POST_LABELS.empty)).toBeVisible()
		await expect(canvas.queryByRole("button", { name: TOPIC_POST_LABELS.newPost })).toBeNull()
	},
}

// a Topic with more posts than one tool result holds links to the rest on the site
export const WithMorePosts: Story = { ...SignedIn, args: { ...SignedIn.args, hasMoreTopicPosts: true } }

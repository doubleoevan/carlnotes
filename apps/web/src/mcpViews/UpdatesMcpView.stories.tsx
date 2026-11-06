// the updates MCP view: the updates list the tool built, with its opener, the feed's findings as a table, and the link
// to what did not fit. a row's controls and its Topic go through the host. a story has no host
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { VISITOR_TOOL_RESULT } from "../../.storybook/fixtures/mcpViews"
import { UPDATES_STORY, UPDATES_STORY_TOPICS } from "../../.storybook/fixtures/updates"
import { McpViewToolText } from "./McpViewToolText"
import { setMcpViewData } from "./mcpViewHost"
import { UpdatesMcpView } from "./UpdatesMcpView"

// the MCP view data of a user's updates list
const USER_UPDATES_MCP_VIEW_DATA = {
	session: { userId: "user-vienna", username: "vienna", avatarSource: null, avatarVersion: null },
	podcastEpisodes: [],
	updatesTopics: UPDATES_STORY_TOPICS,
}

const meta = {
	title: "MCP Apps/MCP views/UpdatesMcpView",
	component: UpdatesMcpView,
	args: { updates: UPDATES_STORY },
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: USER_UPDATES_MCP_VIEW_DATA }),
	parameters: { session: "user", surface: "page" },
} satisfies Meta<typeof UpdatesMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a user's updates list
export const SignedIn: Story = {}

// an updates list with no opener starts at its first row
export const WithoutOpener: Story = { args: { updates: { ...UPDATES_STORY, opener: null } } }

// nothing unread
export const Empty: Story = { args: { updates: { ...UPDATES_STORY, findings: [], moreCount: 0 } } }

// a visitor's call returns only the tool's words
export const Visitor: Story = {
	parameters: { session: "visitor" },
	render: () => <McpViewToolText toolResult={VISITOR_TOOL_RESULT} />,
}

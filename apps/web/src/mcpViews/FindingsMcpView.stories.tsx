// the findings MCP view: the feed's findings as a table under the topic's name, its play button, and Follow. a
// user's thumbs, bookmark, and read toggle call their tools through the host. a story has no host
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { toFindingsMcpViewData } from "../../.storybook/fixtures/mcpViews"
import { FindingsMcpView } from "./FindingsMcpView"
import { setMcpViewData } from "./mcpViewHost"

const meta = {
	title: "MCP Apps/MCP views/FindingsMcpView",
	component: FindingsMcpView,
	parameters: { session: "visitor", surface: "page" },
} satisfies Meta<typeof FindingsMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's MCP view: the rows and the play button, with no Follow and no buttons that need an account
export const Visitor: Story = {
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: toFindingsMcpViewData(false) }),
}

// a user's MCP view, with Follow, and each open row's thumbs, bookmark, and read toggle
export const SignedIn: Story = {
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: toFindingsMcpViewData(true) }),
	parameters: { session: "user" },
}

// the search MCP view: the search tool's page as a table, with Follow on a user's topic rows and See all.
// its paging and sorting call the search tool through the host. a story has no host
import type { McpSearchPage } from "@carlnotes/contracts/mcpViews"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { MCP_SEARCH_PAGE } from "../../.storybook/fixtures/mcpViews"
import { PHONE_VIEWPORT_GLOBALS } from "../../.storybook/viewports"
import { SearchMcpView } from "./SearchMcpView"

// the same page as a visitor's search returns it, with no subscription state
const VISITOR_MCP_SEARCH_PAGE: McpSearchPage = {
	...MCP_SEARCH_PAGE,
	rows: MCP_SEARCH_PAGE.rows.map((mcpSearchRow) =>
		mcpSearchRow.kind === "topic" ? { ...mcpSearchRow, isSubscribed: null } : mcpSearchRow,
	),
}

const meta = {
	title: "MCP Apps/MCP views/SearchMcpView",
	component: SearchMcpView,
	args: { mcpSearchPage: VISITOR_MCP_SEARCH_PAGE },
	argTypes: { mcpSearchPage: { control: "object" } },
	parameters: { session: "visitor", surface: "page" },
} satisfies Meta<typeof SearchMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's search: every kind of row, and no Follow
export const Visitor: Story = {}

// a signed-in caller's search, with Follow on each topic row
export const SignedIn: Story = { args: { mcpSearchPage: MCP_SEARCH_PAGE }, parameters: { session: "user" } }

// the MCP view at 375 pixels
export const Phone: Story = { globals: PHONE_VIEWPORT_GLOBALS }

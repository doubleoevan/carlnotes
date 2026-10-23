// the mcp search card: the search tool's page in the search page's list, with Follow on a signed-in caller's topic
// rows and See all. its paging and sorting call the search tool through the host, which a story has none of
import type { McpSearchPage } from "@carlnotes/contracts/mcpCards"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { SEARCH_PAGE_FIXTURE } from "../../.storybook/fixtures/search"
import { PHONE_VIEWPORT_GLOBALS } from "../../.storybook/viewports"
import { SearchCard } from "./SearchCard"

// the search page fixture as the search tool returns it, each row with its absolute url
const MCP_SEARCH_PAGE: McpSearchPage = {
	...SEARCH_PAGE_FIXTURE,
	rows: SEARCH_PAGE_FIXTURE.rows.map((searchRow) => ({ ...searchRow, url: `https://carlnotes.com${searchRow.path}` })),
	searchRequest: searchRequestPayload.parse({ q: "espresso" }),
	searchUrl: "https://carlnotes.com/search?q=espresso",
}

// the same page as a visitor's search returns it, with no subscription state
const VISITOR_MCP_SEARCH_PAGE: McpSearchPage = {
	...MCP_SEARCH_PAGE,
	rows: MCP_SEARCH_PAGE.rows.map((mcpSearchRow) =>
		mcpSearchRow.kind === "topic" ? { ...mcpSearchRow, isSubscribed: null } : mcpSearchRow,
	),
}

const meta = {
	title: "MCP cards/SearchCard",
	component: SearchCard,
	args: { mcpSearchPage: VISITOR_MCP_SEARCH_PAGE },
	argTypes: { mcpSearchPage: { control: "object" } },
	parameters: { session: "visitor", surface: "card" },
} satisfies Meta<typeof SearchCard>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's search: every kind of row, and no Follow
export const Visitor: Story = {}

// a signed-in caller's search, with Follow on each topic row
export const SignedIn: Story = { args: { mcpSearchPage: MCP_SEARCH_PAGE }, parameters: { session: "user" } }

// the card at 375 pixels
export const Phone: Story = { globals: PHONE_VIEWPORT_GLOBALS }

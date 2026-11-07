// the findings MCP view: the feed's findings as a table under the topic's name, its play button, and Follow. a
// user's thumbs, bookmark, read toggle, and reaction call their tools through the host. a story has no host
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
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

// the first finding's open row: its reactions with their counts under the user's buttons, saved through the tool
export const OpenRowWithReactions: Story = {
	...SignedIn,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getAllByRole("button", { name: "Show Carl's notes" })[0] as HTMLElement)
		await expect(await canvas.findByRole("button", { name: "Like, 4" })).toBeVisible()
	},
}

// the second finding's open row, which has no reactions yet: the six types with no counts
export const OpenRowWithoutReactions: Story = {
	...SignedIn,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getAllByRole("button", { name: "Show Carl's notes" })[1] as HTMLElement)
		await expect(await canvas.findByRole("button", { name: "Like" })).toBeVisible()
	},
}

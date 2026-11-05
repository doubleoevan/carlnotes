import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { LinkOpenerContext } from "@/components/common/AnchorLink"
import { openInNewTab } from "@/lib/externalLinks"
import { McpViewBrand } from "./McpViewBrand"

// the host owns navigation from an embedded MCP view
const meta = {
	title: "MCP Apps/MCP views/McpViewBrand",
	component: McpViewBrand,
	decorators: [
		(Story) => (
			<LinkOpenerContext.Provider value={openInNewTab}>
				<Story />
			</LinkOpenerContext.Provider>
		),
	],
} satisfies Meta<typeof McpViewBrand>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

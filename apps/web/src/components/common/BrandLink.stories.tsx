// the brand link: the coffee mug and CarlNotes, as the site header and the MCP view shell each style them
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { LOGO_CLASS } from "@/lib/styleClasses"
import { BrandLink } from "./BrandLink"

const meta = {
	title: "Common/BrandLink",
	component: BrandLink,
	args: { href: "/", "aria-label": "CarlNotes home" },
} satisfies Meta<typeof BrandLink>

export default meta
type Story = StoryObj<typeof meta>

// the site header's brand, on the hero's color
export const Header: Story = {
	args: { mugClassName: "text-hero-accent -translate-y-0.5", nameClassName: LOGO_CLASS },
	decorators: [
		(Story) => (
			<div className="bg-hero text-hero-foreground p-4">
				<Story />
			</div>
		),
	],
}

// the MCP view shell's slim brand
export const McpViewShell: Story = {
	args: {
		mugClassName: "text-primary size-5 shrink-0",
		nameClassName: "text-muted-foreground font-display text-sm hover:underline",
	},
}

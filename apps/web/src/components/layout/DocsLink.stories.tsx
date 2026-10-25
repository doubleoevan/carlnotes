// the link to the docs site, which opens in a new tab, styled by each place that shows it
import { cn } from "@carlnotes/nightshift/classNames"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { buttonVariants } from "@/components/primitives/button"
import { HERO_BUTTON_HOVER_CLASS, MENU_OPTION_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { DocsLink } from "./DocsLink"

const meta = {
	title: "Layout/DocsLink",
	component: DocsLink,
	args: { className: STANDALONE_LINK_CLASS, hasIcon: false, label: "What CarlNotes Is", onNavigate: fn() },
	argTypes: {
		className: { control: "text" },
		hasIcon: { control: "boolean" },
		label: { control: "text" },
		onNavigate: { control: false },
	},
} satisfies Meta<typeof DocsLink>

export default meta
type Story = StoryObj<typeof meta>

// the plain text link the footer shows on the page background, in the footer's small muted text
export const TextLink: Story = {
	decorators: [
		(Story) => (
			<div className="text-muted-foreground text-sm">
				<Story />
			</div>
		),
	],
}

// the menu row the user menu and the phone menu show, with the book icon its sibling rows match
export const MenuOption: Story = {
	args: { className: MENU_OPTION_CLASS, hasIcon: true },
	decorators: [
		(Story) => (
			<div
				className="bg-popover text-popover-foreground rounded-md border shadow-raised"
				style={{ width: 208, padding: 4 }}
			>
				<Story />
			</div>
		),
	],
}

// the ghost button the header shows a visitor on the hero band
export const HeaderButton: Story = {
	args: {
		className: cn(buttonVariants({ variant: "ghost" }), "min-h-9", HERO_BUTTON_HOVER_CLASS),
	},
	parameters: { surface: "hero" },
}

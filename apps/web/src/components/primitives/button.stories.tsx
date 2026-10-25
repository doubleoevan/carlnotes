// the button primitive: six variants and six sizes, three of them square for an icon
import { buttonSizeNames, buttonVariantNames } from "@carlnotes/nightshift/components/button"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Lightbulb, Plus, ThumbsDown, ThumbsUp, X } from "lucide-react"
import { fn } from "storybook/test"
import { Button } from "./button"

const meta = {
	title: "Primitives/Button",
	component: Button,
	args: { children: "Save topic", variant: "default", size: "default", disabled: false, onClick: fn() },
	argTypes: {
		variant: { control: "inline-radio", options: buttonVariantNames },
		size: { control: "inline-radio", options: buttonSizeNames },
		children: { control: "text" },
		disabled: { control: "boolean" },
		asChild: { control: false },
		onClick: { control: false },
	},
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

// the primary fill, the button's default
export const Default: Story = {}

// the red fill on the dialog panel, as the confirm dialog's delete button
export const Destructive: Story = {
	args: { variant: "destructive", children: "Delete topic" },
	parameters: { surface: "card" },
}

// a border and the page color's fill on the dialog panel, as the edit topic dialog's cancel button
export const Outline: Story = { args: { variant: "outline", children: "Cancel" }, parameters: { surface: "card" } }

// the quiet fill, which no button in the app uses
export const Secondary: Story = { args: { variant: "secondary", children: "Skip for now" } }

// no fill until hover, as a dialog's cancel button
export const Ghost: Story = { args: { variant: "ghost", children: "Cancel" } }

// text in the link color, as the more toggle under a topic's findings, with only the label underlined on hover
export const Link: Story = {
	args: {
		variant: "link",
		size: "sm",
		className: "group text-link mt-1 h-auto min-h-11 justify-start pr-0 pl-9 text-sm hover:no-underline sm:min-h-9",
	},
	render: (args) => (
		<Button {...args}>
			<span className="underline-offset-4 group-hover:underline">+ 5 more </span>
			<span className="text-lg leading-none">▾</span>
		</Button>
	),
}

// the home page's small New Topic button, 44px tall on a phone, beside the default size. no app button is large
export const Sizes: Story = {
	render: (args) => (
		<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
			<Button {...args} size="sm" className="min-h-11 shrink-0 gap-1.5 rounded-lg sm:min-h-9">
				<Plus className="size-4" />
				New Topic
			</Button>
			<Button {...args} size="default" />
		</div>
	),
}

// a table row's small ghost ✕ and the rating thumbs, 44px on a phone. no app button uses the large square size
export const IconSizes: Story = {
	parameters: { surface: "card" },
	render: (args) => (
		<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
			<Button {...args} variant="ghost" size="icon-sm" aria-label="Delete Reading Group">
				<X className="size-4" />
			</Button>
			{/* the thumbs up the user pressed, then the thumbs down */}
			<Button {...args} size="icon" aria-label="Thumbs up" aria-pressed className="size-11 shrink-0 sm:size-9">
				<ThumbsUp className="size-4" />
			</Button>
			<Button
				{...args}
				variant="outline"
				size="icon"
				aria-label="Thumbs down"
				aria-pressed={false}
				className="size-11 shrink-0 sm:size-9"
			>
				<ThumbsDown className="size-4" />
			</Button>
		</div>
	),
}

// an icon before the label tightens the side padding, as the edit topic dialog's small Recommend button
export const WithIcon: Story = {
	args: { variant: "outline", size: "sm" },
	parameters: { surface: "card" },
	render: (args) => (
		<Button {...args}>
			<Lightbulb className="size-3.5" />
			Recommend
		</Button>
	),
}

// a disabled button, dimmed and ignoring clicks
export const Disabled: Story = { args: { disabled: true } }

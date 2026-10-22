// the icon button: an icon with an action tooltip, which is also the button's accessible name
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Copy, LoaderCircle, RotateCcw, Trash2 } from "lucide-react"
import { fn } from "storybook/test"
import { SKIP_BACK_SECONDS } from "@/lib/podcastEpisodePlayback"
import { PLAYBACK_CONTROL_BUTTON_CLASS, SEND_BUTTON_CLASS } from "@/lib/styleClasses"
import { IconButton } from "./IconButton"

const meta = {
	title: "Common/IconButton",
	component: IconButton,
	args: { tooltip: "Copy link", onClick: fn(), children: <Copy className="size-4" /> },
	argTypes: {
		tooltip: { control: "text" },
		ariaLabel: { control: "text" },
		isDisabled: { control: "boolean" },
		className: { control: "text" },
		onClick: { control: false },
		children: { control: false },
	},
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

// the muted icon, which brightens on hover
export const Default: Story = {}

// the composer's mic while the microphone request or the transcription runs, dimmed and showing a spinner
export const Disabled: Story = {
	args: {
		tooltip: "Talk to Carl",
		isDisabled: true,
		className: SEND_BUTTON_CLASS,
		children: <LoaderCircle className="size-4 animate-spin" />,
	},
}

// a tooltip with markup, which needs a plain-text aria label beside it
export const MarkupTooltip: Story = {
	args: {
		tooltip: (
			<>
				Delete <span className="font-semibold">LLM tooling</span>
			</>
		),
		ariaLabel: "Delete LLM tooling",
		children: <Trash2 className="size-4" />,
	},
}

// a className that replaces the muted look, here the podcast player card's skip back pill
export const OwnLook: Story = {
	args: {
		tooltip: `Skip back ${SKIP_BACK_SECONDS} seconds`,
		className: PLAYBACK_CONTROL_BUTTON_CLASS,
		children: <RotateCcw className="size-4.5" />,
	},
	parameters: { surface: "card" },
}

// the tooltip open over the button, as a hover shows it
export const TooltipOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("button", { name: "Copy link" }))
	},
}

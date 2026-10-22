// the switch primitive: an on and off slider, named by an aria-label
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import type * as React from "react"
import { fn } from "storybook/test"
import { useSyncedArg } from "../../../.storybook/useSyncedArg"
import { Switch } from "./switch"

const meta = {
	title: "Primitives/Switch",
	component: Switch,
	args: { checked: false, disabled: false, "aria-label": "Public", onCheckedChange: fn() },
	argTypes: {
		checked: { control: "boolean" },
		disabled: { control: "boolean" },
		"aria-label": { control: "text" },
		onCheckedChange: { control: false },
		asChild: { control: false },
	},
	// the app always controls checked itself, so the story keeps the checked control in sync with a click
	render: function Render({ onCheckedChange, ...args }) {
		// report the change and keep the checked control in sync
		const handleCheckedChange = useSyncedArg<React.ComponentProps<typeof Switch>, "checked">("checked", onCheckedChange)
		return <Switch {...args} onCheckedChange={handleCheckedChange} />
	},
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

// the switch off, in the muted track
export const Off: Story = {}

// the switch on, in the primary track
export const On: Story = { args: { checked: true } }

// a disabled switch, dimmed and ignoring clicks
export const Disabled: Story = { args: { disabled: true, checked: true } }

// the larger switch the podcast setting uses in the topic editor dialog, on the card fill
export const Large: Story = {
	args: { className: "h-7.5 w-13 [&>span]:size-6", "aria-label": PODCAST_NAME },
	parameters: { surface: "card" },
}

// the word beside the switch as plain text, as the team dialogs lay it out. a click on the word does nothing
export const WithLabel: Story = {
	parameters: { surface: "card" },
	decorators: [
		(Story) => (
			<div className="flex items-center gap-2 text-sm">
				<Story />
				Public
			</div>
		),
	],
}

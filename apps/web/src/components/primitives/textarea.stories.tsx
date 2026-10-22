// the textarea primitive: a multi-line field that grows with its text
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { Textarea } from "./textarea"

const meta = {
	title: "Primitives/Textarea",
	component: Textarea,
	args: {
		placeholder: "what the team reads about…",
		"aria-label": "Team description",
		"aria-invalid": false,
		disabled: false,
		onChange: fn(),
	},
	argTypes: {
		placeholder: { control: "text" },
		defaultValue: { control: "text" },
		"aria-label": { control: "text" },
		maxLength: { control: "number" },
		"aria-invalid": { control: "boolean" },
		disabled: { control: "boolean" },
		onChange: { control: false },
	},
	// every app textarea sits in a dialog, on the card fill
	parameters: { surface: "card" },
	// the field fills its container, so the story gives it a dialog's content width, narrower on a phone
	decorators: [
		(Story) => (
			<div style={{ width: "100%", maxWidth: 462 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

// an empty field showing its placeholder
export const Empty: Story = {}

// a field holding a short value
export const Filled: Story = { args: { defaultValue: "Vienna Example and friends reading about LLM tooling." } }

// a long value, which grows the field from its 64-pixel floor to fit every line
export const LongText: Story = {
	args: {
		defaultValue:
			"The weekly scan keeps finding the same benchmark post from three mirrors. Carl should keep the original at example.com and skip the copies.\n\nThe podcast episode on Friday ran long too. Two of the findings it read were already in last week's episode, so a shorter episode with only the new findings would suit the team better.",
	},
}

// a field marked invalid, with a red border, and a red ring on focus. no app textarea is ever invalid
export const Invalid: Story = { args: { "aria-invalid": true } }

// a disabled field, dimmed and ignoring input. the primitive draws it, though no app textarea is ever disabled
export const Disabled: Story = { args: { disabled: true, defaultValue: "Vienna Example and friends." } }

// a muted line above the field and the dialog's gap between them, as the report dialog lays it out
export const WithLabel: Story = {
	args: { placeholder: undefined, "aria-label": "Why you are reporting this" },
	decorators: [
		(Story) => (
			<div className="grid gap-4">
				<p className="text-muted-foreground text-sm">What is wrong with it?</p>
				<Story />
			</div>
		),
	],
}

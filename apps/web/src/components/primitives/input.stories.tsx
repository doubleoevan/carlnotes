// the input primitive: a one-line text field, with its placeholder, invalid, disabled, and file states
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { Input } from "./input"
import { Label } from "./label"

const meta = {
	title: "Primitives/Input",
	component: Input,
	args: {
		type: "text",
		placeholder: "Name your topic",
		"aria-label": "Topic name",
		"aria-invalid": false,
		disabled: false,
		onChange: fn(),
	},
	argTypes: {
		type: { control: "select", options: ["text", "email", "password", "search", "url", "number", "file"] },
		placeholder: { control: "text" },
		defaultValue: { control: "text" },
		"aria-label": { control: "text" },
		"aria-invalid": { control: "boolean" },
		disabled: { control: "boolean" },
		onChange: { control: false },
	},
	// the plain field sits on a dialog panel or a card, whose fill the card surface matches
	parameters: { surface: "card" },
	// the field fills its container, so the story gives it the account form's width
	decorators: [
		(Story) => (
			<div className="w-full max-w-sm">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

// an empty field showing its placeholder
export const Empty: Story = {}

// a field holding a value
export const Filled: Story = { args: { defaultValue: "LLM tooling" } }

// a missed required field, with the red border the edit topic dialog gives it
export const Invalid: Story = { args: { className: "border-destructive" } }

// a disabled field, dimmed and ignoring input. no field in the app is disabled
export const Disabled: Story = { args: { disabled: true, defaultValue: "LLM tooling" } }

// a file field, whose button takes the field's own text style. the app hides its file inputs behind a link or button
export const File: Story = { args: { type: "file", "aria-label": "Attachment", placeholder: undefined } }

// a label above the field on the card, as the account settings lay it out
export const WithLabel: Story = {
	args: {
		id: "input-story-email",
		type: "email",
		placeholder: undefined,
		"aria-label": undefined,
		className: "bg-card dark:bg-card",
	},
	decorators: [
		(Story) => (
			<div className="space-y-1.5">
				<Label htmlFor="input-story-email">New email</Label>
				<Story />
			</div>
		),
	],
}

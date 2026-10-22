// the uppercase display-font label above a form field, with an asterisk on a required one
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Input } from "@/components/primitives/input"
import { FieldLabel } from "./FieldLabel"

const meta = {
	title: "Common/FieldLabel",
	component: FieldLabel,
	args: { children: "Tags", isRequired: false },
	argTypes: {
		children: { control: "text" },
		isRequired: { control: "boolean" },
		htmlFor: { control: false },
	},
	// the topic, team, and invite dialogs every field label sits in
	parameters: { surface: "card" },
} satisfies Meta<typeof FieldLabel>

export default meta
type Story = StoryObj<typeof meta>

// an optional heading over a group of fields, like the topic dialog's Tags. with no htmlFor it renders as a div
export const Default: Story = {}

// a required field's label, with the asterisk, like the topic dialog's Title
export const Required: Story = { args: { children: "Title", isRequired: true } }

// the label over the input it sits above, as the team dialog lays out its Name field. htmlFor ties the label to the
// input's id, so the label names the input. the asterisk is hidden from that name, so the input takes aria-required
export const AboveInput: Story = {
	args: { children: "Name", isRequired: true, htmlFor: "team-name" },
	render: (args) => (
		<div style={{ maxWidth: 320 }}>
			<FieldLabel {...args} />
			<Input id="team-name" placeholder="what to call it…" aria-required />
		</div>
	),
}

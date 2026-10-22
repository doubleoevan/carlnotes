// the label primitive: a form field's name, set above the field
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Input } from "./input"
import { Label } from "./label"

const meta = {
	title: "Primitives/Label",
	component: Label,
	args: { children: "New username" },
	argTypes: {
		children: { control: "text" },
		htmlFor: { control: "text" },
		asChild: { control: false },
	},
} satisfies Meta<typeof Label>

export default meta
type Story = StoryObj<typeof meta>

// the label on its own
export const Default: Story = {}

// a label above the field it names on the card, as the account settings lay it out
export const WithInput: Story = {
	args: { htmlFor: "label-story-username" },
	parameters: { surface: "card" },
	decorators: [
		(Story) => (
			<div className="w-full max-w-sm space-y-1.5">
				<Story />
				<Input id="label-story-username" placeholder="ada_example" className="bg-card dark:bg-card" />
			</div>
		),
	],
}

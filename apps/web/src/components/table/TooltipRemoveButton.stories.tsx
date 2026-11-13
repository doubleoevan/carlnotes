// a table row's ghost X button with a tooltip that names its action and, in bold, the name it acts on
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { TooltipRemoveButton } from "./TooltipRemoveButton"

const meta = {
	title: "Table/TooltipRemoveButton",
	component: TooltipRemoveButton,
	args: { action: "Unfollow", name: "Pour-over coffee", isDisabled: false, onPress: fn() },
	argTypes: {
		action: { control: "text" },
		name: { control: "text" },
		afterName: { control: "text" },
		isDisabled: { control: "boolean" },
		onPress: { control: false },
	},
	// the table cards the button sits in
	parameters: { surface: "card" },
} satisfies Meta<typeof TooltipRemoveButton>

export default meta
type Story = StoryObj<typeof meta>

// a subscription's delete button
export const DeleteSubscription: Story = {}

// a team member's remove button, with words after the member's name
export const RemoveMember: Story = { args: { action: "Remove", name: "Carlos", afterName: "from the team" } }

// a button the row cannot press
export const Disabled: Story = { args: { isDisabled: true } }

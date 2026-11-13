// a table row's switch with a tooltip that names its action and, in bold, the name it acts on
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { TooltipSwitch } from "./TooltipSwitch"

const meta = {
	title: "Table/TooltipSwitch",
	component: TooltipSwitch,
	args: { action: "Deactivate", name: "Vienna", isChecked: true, isDisabled: false, onChange: fn() },
	argTypes: {
		action: { control: "text" },
		name: { control: "text" },
		afterName: { control: "text" },
		isChecked: { control: "boolean" },
		isDisabled: { control: "boolean" },
		className: { control: "text" },
		onChange: { control: false },
	},
	// the table cards the switch sits in
	parameters: { surface: "card" },
} satisfies Meta<typeof TooltipSwitch>

export default meta
type Story = StoryObj<typeof meta>

// an active member's switch, which deactivates the member
export const On: Story = {}

// an inactive member's switch, which activates the member
export const Off: Story = { args: { action: "Activate", isChecked: false } }

// a switch the row cannot change
export const Disabled: Story = { args: { isDisabled: true } }

// a switch faded until it can act, as a teams table's invite row shows it
export const Faded: Story = {
	args: { action: "Join", name: "Design Guild", isChecked: false, className: "opacity-50" },
}

// a sent invite's switch, which withdraws the invite
export const WithdrawInvite: Story = { args: { action: "Withdraw the invite to", name: "mira@example.com" } }

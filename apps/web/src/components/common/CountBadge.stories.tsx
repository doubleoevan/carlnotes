// the round count every badge alert uses, which shows 9+ past nine
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { CountBadge } from "./CountBadge"

const meta = {
	title: "Common/CountBadge",
	component: CountBadge,
	args: { count: 3 },
	argTypes: {
		count: { control: { type: "number", min: 0 } },
		className: { control: "text" },
	},
	// the badge is a flex box sized by its count. the app sets it in a flex row or a corner, so the story centers it
	// instead of letting the frame stretch it
	parameters: { layout: "centered" },
} satisfies Meta<typeof CountBadge>

export default meta
type Story = StoryObj<typeof meta>

// a single-digit count
export const Default: Story = {}

// nine, the largest count the badge shows as a number
export const Nine: Story = { args: { count: 9 } }

// a count past nine, which shows as 9+
export const OverNine: Story = { args: { count: 42 } }

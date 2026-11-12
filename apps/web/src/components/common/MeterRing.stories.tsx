// a meter as a ring: partly full, empty, and past its limit
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { MeterRing } from "./MeterRing"

const meta = {
	title: "Common/MeterRing",
	component: MeterRing,
	args: { share: 0.4, centerText: "2 of 5", centerSubtext: "per sweep", ariaLabel: "2 of 5 per sweep" },
	argTypes: { share: { control: { type: "range", min: 0, max: 1.5, step: 0.05 } } },
	parameters: { surface: "card" },
} satisfies Meta<typeof MeterRing>

export default meta
type Story = StoryObj<typeof meta>

// two fifths full
export const Default: Story = {}

// nothing counted so no arc shows
export const Empty: Story = {
	args: { share: 0, centerText: "0 of 50", centerSubtext: "before an alert", ariaLabel: "0 of 50 before an alert" },
}

// past the limit so the ring is full
export const PastLimit: Story = {
	args: {
		share: 1.28,
		centerText: "64 of 50",
		centerSubtext: "before an alert",
		ariaLabel: "64 of 50 before an alert",
	},
}

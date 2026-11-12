import type { Meta, StoryObj } from "@storybook/react-native"
import { MeterRing } from "./MeterRing"

// a meter as a ring: partly full, empty, and past its limit, matching the web's stories
const meta = {
	title: "Common/MeterRing",
	component: MeterRing,
	parameters: { webReference: "common-meterring--default" },
	args: { share: 0.4, centerText: "2 of 5", centerSubtext: "per sweep", ariaLabel: "2 of 5 per sweep" },
} satisfies Meta<typeof MeterRing>
export default meta
type Story = StoryObj<typeof meta>

// two fifths full
export const Default: Story = {}

// nothing counted so no arc shows
export const Empty: Story = {
	parameters: { webReference: "common-meterring--empty" },
	args: { share: 0, centerText: "0 of 50", centerSubtext: "before an alert", ariaLabel: "0 of 50 before an alert" },
}

// past the limit so the ring is full
export const PastLimit: Story = {
	parameters: { webReference: "common-meterring--past-limit" },
	args: {
		share: 1.28,
		centerText: "64 of 50",
		centerSubtext: "before an alert",
		ariaLabel: "64 of 50 before an alert",
	},
}

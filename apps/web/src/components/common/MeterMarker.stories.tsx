// one circle above a meter's bar: ahead, passed, and moving
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { MeterBar } from "./MeterBar"
import { MeterMarker } from "./MeterMarker"

const meta = {
	title: "Common/MeterMarker",
	component: MeterMarker,
	args: { percent: 60, label: "$65", ariaLabel: "At $65", isPassed: false, children: "At $65" },
	argTypes: {
		percent: { control: { type: "range", min: 0, max: 100 } },
		label: { control: "text" },
		isPassed: { control: "boolean" },
		isMoving: { control: "boolean" },
	},
	parameters: { surface: "card" },
	// the circle sits over a bar that is 30 percent full
	decorators: [
		(Story) => (
			<MeterBar segments={[{ key: "spend", colorClass: "bg-primary", widthPercent: 30 }]} hasMarkers>
				<Story />
			</MeterBar>
		),
	],
} satisfies Meta<typeof MeterMarker>

export default meta
type Story = StoryObj<typeof meta>

// a circle the bar has not reached
export const Default: Story = {}

// a faded circle the bar passed
export const Passed: Story = { args: { percent: 20, isPassed: true } }

// a dashed circle whose place moves
export const Moving: Story = { args: { isMoving: true } }

// a labeled count whose highlighted number flashes once each time the count changes, and stays still under reduced
// motion
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { Button } from "@/components/primitives/button"
import { FlashingCount } from "./FlashingCount"

// a count in the muted counts line's text, beside a button that adds one to the count
function ChangingCount({ label, isMotionReduced }: { label: string; isMotionReduced: boolean }) {
	const [count, setCount] = useState(11)
	return (
		<div
			className="text-muted-foreground flex items-center gap-4 text-sm"
			data-motion={isMotionReduced ? "reduced" : undefined}
		>
			<FlashingCount label={label} count={count} />
			<Button variant="outline" size="sm" onClick={() => setCount((currentCount) => currentCount + 1)}>
				Add one
			</Button>
		</div>
	)
}

const meta = {
	title: "Common/FlashingCount",
	component: FlashingCount,
	args: { label: "Viewers", count: 12 },
	argTypes: {
		label: { control: "text" },
		count: { control: { type: "number", min: 0 } },
	},
	decorators: [
		(Story) => (
			<div className="text-muted-foreground text-sm">
				<Story />
			</div>
		),
	],
	parameters: { layout: "centered" },
} satisfies Meta<typeof FlashingCount>

export default meta
type Story = StoryObj<typeof meta>

// a count that has not changed, which never flashes
export const Default: Story = {}

// a count in the thousands shows its separator
export const Thousands: Story = { args: { count: 12_345 } }

// a count that changes flashes its number once in the highlight color
export const Changing: Story = {
	render: (args) => <ChangingCount label={args.label} isMotionReduced={false} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole("button", { name: "Add one" }))
		await expect(canvas.getByText("12")).toHaveClass("animate-count-flash")
	},
}

// the same change under reduced motion shows the new number with no flash
export const ReducedMotion: Story = {
	render: (args) => <ChangingCount label={args.label} isMotionReduced />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole("button", { name: "Add one" }))
		await expect(getComputedStyle(canvas.getByText("12")).animationName).toBe("none")
	},
}

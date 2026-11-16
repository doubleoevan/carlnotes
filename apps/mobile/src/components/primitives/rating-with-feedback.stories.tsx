import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { Sheet } from "../common/Sheet"
import { RatingWithFeedback, RatingWithFeedbackSkeleton } from "./rating-with-feedback"

// provide the same native sheet and keyboard behavior the production field uses
const meta: Meta<typeof RatingWithFeedback> = {
	title: "Primitives/RatingWithFeedback",
	component: RatingWithFeedback,
	parameters: { webReference: "Primitives/RatingWithFeedback at 375px" },
	args: {
		label: "Feedback for Carl (optional)",
		rating: null,
		value: "",
		onChange: () => undefined,
		onRate: () => undefined,
	},
	render: function RenderRatingWithFeedback(args) {
		// keep the example interactive inside the keyboard-aware sheet
		const [rating, setRating] = useState(args.rating)
		const [value, setValue] = useState(args.value)
		return (
			<Sheet title="Feedback" onClose={() => undefined}>
				<RatingWithFeedback {...args} rating={rating} value={value} onRate={setRating} onChange={setValue} />
			</Sheet>
		)
	},
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Acknowledged: Story = { args: { rating: "up", message: "Noted. Carl reads these later." } }
export const Loading: Story = { render: () => <RatingWithFeedbackSkeleton /> }

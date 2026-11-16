import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { useSyncedArg } from "../../../.storybook/useSyncedArg"
import { RatingWithFeedback, RatingWithFeedbackSkeleton } from "./rating-with-feedback"

// preview the row on the card surface used by Findings and TopicMemories
const meta = {
	title: "Primitives/RatingWithFeedback",
	component: RatingWithFeedback,
	parameters: { surface: "card" },
	args: {
		label: "Feedback for Carl (optional)",
		rating: null,
		value: "",
		onChange: fn(),
		onRate: fn(),
	},
	render: function RenderRatingWithFeedback(args) {
		// keep the field and selected thumb in sync with the story controls
		const handleRate = useSyncedArg<typeof args, "rating">("rating", args.onRate)
		const handleChange = useSyncedArg<typeof args, "value">("value", args.onChange)
		return <RatingWithFeedback {...args} onRate={handleRate} onChange={handleChange} />
	},
} satisfies Meta<typeof RatingWithFeedback>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Acknowledged: Story = { args: { rating: "up", message: "Noted. Carl reads these later." } }
export const Loading: Story = { render: () => <RatingWithFeedbackSkeleton /> }

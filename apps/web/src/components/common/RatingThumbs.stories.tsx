// the rating thumbs: a thumbs up and a thumbs down that set a rating, and clear it when pressed again
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { useSyncedArg } from "../../../.storybook/useSyncedArg"
import { RatingThumbs } from "./RatingThumbs"

const meta = {
	title: "Common/RatingThumbs",
	component: RatingThumbs,
	args: { rating: null, onRate: fn() },
	argTypes: {
		rating: { control: "inline-radio", options: ["up", "down", null] },
		ariaLabelSuffix: { control: "text" },
		onRate: { control: false },
	},
	// the resource info popover and the podcast episode's chapter rows, which share the card fill
	parameters: { surface: "card" },
	// the two thumbs side by side, as the resource info popover lays them out
	decorators: [
		(Story) => (
			<div style={{ display: "flex", gap: 8 }}>
				<Story />
			</div>
		),
	],
	render: function RenderRatingThumbs(args) {
		// record the press, then keep the rating in the args so the highlight and the control move
		const handleRate = useSyncedArg<typeof args, "rating">("rating", args.onRate)
		return <RatingThumbs {...args} onRate={handleRate} />
	},
} satisfies Meta<typeof RatingThumbs>

export default meta
type Story = StoryObj<typeof meta>

// no rating yet, both thumbs outlined
export const Unrated: Story = {}

// a thumbs up, filled and pressed
export const RatedUp: Story = { args: { rating: "up" } }

// a thumbs down, filled and pressed
export const RatedDown: Story = { args: { rating: "down" } }

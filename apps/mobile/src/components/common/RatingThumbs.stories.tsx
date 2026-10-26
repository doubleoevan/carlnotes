import type { Rating } from "@carlnotes/core/components/RatingThumbs"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { View } from "react-native"
import { RatingThumbs } from "./RatingThumbs"

// compare the same named web component at phone width
const meta: Meta<typeof RatingThumbs> = {
	title: "Common/RatingThumbs",
	component: RatingThumbs,
	parameters: { webReference: "apps/web/src/components/common/RatingThumbs.tsx at 375px", surface: "card" },
	args: { rating: null, onRate: () => undefined },
	render: (args) => {
		const [rating, setRating] = useState<Rating>(args.rating)
		return (
			<View className="flex-row gap-2">
				<RatingThumbs {...args} rating={rating} onRate={setRating} />
			</View>
		)
	},
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Rated: Story = { args: { rating: "up" } }
export const Disabled: Story = { args: { isDisabled: true } }

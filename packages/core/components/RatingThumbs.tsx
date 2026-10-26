import type { ComponentType } from "react"

// both platforms use the same rating choices and selected-state toggle
export type Rating = "up" | "down" | null
export type RatingThumbProps = {
	thumb: Exclude<Rating, null>
	isSelected: boolean
	isDisabled: boolean
	label: string
	onPress: () => void
}
export type RatingThumbsProps = {
	rating: Rating
	onRate: (rating: Rating) => void
	ariaLabelSuffix?: string
	isDisabled?: boolean
}

/**
 * Renders both rating buttons and clears a rating when its selected thumb is pressed again.
 */
export function RatingThumbs({
	rating,
	onRate,
	ariaLabelSuffix = "",
	isDisabled = false,
	Thumb,
}: RatingThumbsProps & { Thumb: ComponentType<RatingThumbProps> }) {
	return (
		<>
			{(["up", "down"] as const).map((thumb) => (
				<Thumb
					key={thumb}
					thumb={thumb}
					isSelected={rating === thumb}
					isDisabled={isDisabled}
					label={`Thumbs ${thumb}${ariaLabelSuffix}`}
					onPress={() => onRate(rating === thumb ? null : thumb)}
				/>
			))}
		</>
	)
}

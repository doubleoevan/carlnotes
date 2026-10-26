import {
	type RatingThumbProps,
	type RatingThumbsProps,
	RatingThumbs as SharedRatingThumbs,
} from "@carlnotes/core/components/RatingThumbs"
import { ThumbsDown, ThumbsUp } from "lucide-react"
import { Button } from "@/components/primitives/button"

/**
 * A thumbs up and a thumbs down that set a rating. Pressing the thumb that is already on clears the rating.
 */
export function RatingThumbs(props: RatingThumbsProps) {
	return <SharedRatingThumbs {...props} Thumb={RatingThumb} />
}

// keep the browser's button semantics and responsive touch target in its adapter
function RatingThumb({ thumb, isSelected, isDisabled, label, onPress }: RatingThumbProps) {
	return (
		<Button
			type="button"
			variant={isSelected ? "default" : "outline"}
			size="icon"
			aria-label={label}
			aria-pressed={isSelected}
			disabled={isDisabled}
			onClick={onPress}
			className="size-11 shrink-0 sm:size-9"
		>
			{thumb === "up" ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
		</Button>
	)
}

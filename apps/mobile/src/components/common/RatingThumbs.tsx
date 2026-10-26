import {
	type RatingThumbProps,
	type RatingThumbsProps,
	RatingThumbs as SharedRatingThumbs,
} from "@carlnotes/core/components/RatingThumbs"
import { ThumbsDown, ThumbsUp } from "lucide-react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"

/**
 * Draws the shared rating controls with native touch targets and selected-state announcements.
 */
export function RatingThumbs(props: RatingThumbsProps) {
	return <SharedRatingThumbs {...props} Thumb={RatingThumb} />
}

// draw the web's phone-size button and variant for each shared thumb
function RatingThumb({ thumb, isSelected, isDisabled, label, onPress }: RatingThumbProps) {
	return (
		<Button
			variant={isSelected ? "default" : "outline"}
			size="icon"
			className="size-11"
			accessibilityLabel={label}
			accessibilityState={{ selected: isSelected }}
			disabled={isDisabled}
			onPress={onPress}
		>
			<Icon as={thumb === "up" ? ThumbsUp : ThumbsDown} className="size-4" />
		</Button>
	)
}

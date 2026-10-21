import { ThumbsDown, ThumbsUp } from "lucide-react"
import { Button } from "@/components/primitives/button"

// a rating, the callback that sets or clears the rating, and the text after each thumb's aria label
type RatingThumbsProps = {
	rating: "up" | "down" | null
	onRate: (rating: "up" | "down" | null) => void
	ariaLabelSuffix?: string
}

/**
 * A thumbs up and a thumbs down that set a rating. Pressing the thumb that is already on clears the rating.
 */
export function RatingThumbs({ rating, onRate, ariaLabelSuffix = "" }: RatingThumbsProps) {
	return (
		<>
			{(["up", "down"] as const).map((thumb) => (
				<Button
					key={thumb}
					type="button"
					variant={rating === thumb ? "default" : "outline"}
					size="icon"
					aria-label={`Thumbs ${thumb}${ariaLabelSuffix}`}
					aria-pressed={rating === thumb}
					onClick={() => onRate(rating === thumb ? null : thumb)}
					className="size-11 shrink-0 sm:size-9"
				>
					{thumb === "up" ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
				</Button>
			))}
		</>
	)
}

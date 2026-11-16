import { FINDING_RATING_NOTE_LIMIT } from "@carlnotes/contracts/payloads"
import type { Rating } from "@carlnotes/core/components/RatingThumbs"
import { useFindingRatingNote } from "@carlnotes/core/hooks/useFindingRatingNote"
import { RatingWithFeedback } from "@/components/primitives/rating-with-feedback"
import { SECTION_LABEL_CLASS } from "@/lib/styleClasses"

/** Saves the Finding's rating together with the optional words beside the thumbs. */
export function TopicFindingRating({
	findingId,
	rating,
	onRateTopicFinding,
}: {
	findingId: string
	rating: Rating
	onRateTopicFinding: (rating: Rating, note?: string) => void
}) {
	const { note, setNote, toFeedback } = useFindingRatingNote(findingId, rating)
	return (
		<div>
			<span className={SECTION_LABEL_CLASS}>Rate this finding</span>
			<div className="mt-2">
				<RatingWithFeedback
					label="Feedback for Carl"
					value={note}
					maxLength={FINDING_RATING_NOTE_LIMIT}
					rating={rating}
					onChange={setNote}
					onRate={(pressed) => {
						const feedback = toFeedback(pressed)
						onRateTopicFinding(feedback.rating, feedback.note)
					}}
				/>
			</div>
		</div>
	)
}

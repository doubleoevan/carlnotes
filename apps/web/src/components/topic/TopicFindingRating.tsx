import { sendFindingFeedback } from "@carlnotes/client/topicFindingClient"
import { useState } from "react"
import { RatingThumbs } from "@/components/common/RatingThumbs"
import { Input } from "@/components/primitives/input"
import { SECTION_LABEL_CLASS } from "@/lib/styleClasses"

/**
 * The rating block. The thumbs set the rating, and a click also sends whatever words sit in the box.
 */
export function TopicFindingRating({
	findingId,
	rating,
	onRateTopicFinding,
}: {
	findingId: string
	rating: "up" | "down" | null
	onRateTopicFinding: (rating: "up" | "down" | null) => void
}) {
	const [topicFindingFeedback, setTopicFindingFeedback] = useState("")
	const [isTopicFindingRatingSent, setIsTopicFindingRatingSent] = useState(false)
	const [isSendingTopicFindingRating, setIsSendingTopicFindingRating] = useState(false)

	// a thumb click sets or clears the rating and sends the box's words with the rating if there are any
	const handleRateTopicFinding = async (nextRating: "up" | "down" | null): Promise<void> => {
		onRateTopicFinding(nextRating)
		if (!topicFindingFeedback.trim() || isSendingTopicFindingRating || isTopicFindingRatingSent) {
			return
		}
		setIsSendingTopicFindingRating(true)
		try {
			await sendFindingFeedback({ findingId, feedback: topicFindingFeedback.trim(), shouldThrowOnError: true })
			setIsTopicFindingRatingSent(true)
		} catch (error) {
			// the words stay in the input, so the next thumb click can retry the send
			console.error("finding feedback send failed", error)
		} finally {
			setIsSendingTopicFindingRating(false)
		}
	}

	return (
		<div>
			<span className={SECTION_LABEL_CLASS}>Rate this finding</span>
			{/* the words sit beside the thumbs that send them, and one line of thanks replaces them once sent */}
			<div className="mt-2 flex items-center gap-2">
				{isTopicFindingRatingSent ? (
					<p className="text-muted-foreground flex-1 text-xs">Noted. Carl reads these later.</p>
				) : (
					<Input
						aria-label="Feedback for Carl"
						placeholder="Tell Carl why this finding was good or bad…"
						value={topicFindingFeedback}
						onChange={(event) => setTopicFindingFeedback(event.target.value)}
						className="h-8 flex-1 text-xs"
					/>
				)}
				<RatingThumbs rating={rating} onRate={(nextRating) => void handleRateTopicFinding(nextRating)} />
			</div>
		</div>
	)
}

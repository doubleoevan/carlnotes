import { showClientError } from "@carlnotes/client/apiClient"
import { sendFindingFeedback } from "@carlnotes/client/topicFindingClient"
import type { Rating } from "@carlnotes/core/components/RatingThumbs"
import { cn } from "@carlnotes/nightshift/classNames"
import { FIELD_CLASS } from "@carlnotes/nightshift/field"
import { BottomSheetTextInput } from "@gorhom/bottom-sheet"
import { useState } from "react"
import { Text, View } from "react-native"
import { withUniwind } from "uniwind"
import { RatingThumbs } from "@/components/common/RatingThumbs"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import type { TopicResourceProps } from "./TopicResource"

// the sheet input participates in native keyboard avoidance
const FeedbackInput = withUniwind(BottomSheetTextInput)
type TopicFindingRatingProps = Pick<
	TopicResourceProps,
	"resource" | "topicFeedHandlers" | "isPending" | "onSendFeedback"
>

/**
 * Sets a finding's rating and sends optional feedback with the same controls as the web.
 */
export function TopicFindingRating({
	resource,
	topicFeedHandlers,
	isPending,
	onSendFeedback = sendFindingFeedback,
}: TopicFindingRatingProps) {
	// retain unsent words when a request fails
	const [topicFindingFeedback, setTopicFindingFeedback] = useState("")
	const [isFeedbackSent, setIsFeedbackSent] = useState(false)
	const [isSendingFeedback, setIsSendingFeedback] = useState(false)
	const handleRate = async (rating: Rating): Promise<void> => {
		// send the rating through the feed's optimistic write handling
		topicFeedHandlers.rateTopicFinding(resource.findingId, rating)
		if (!topicFindingFeedback.trim() || isSendingFeedback || isFeedbackSent) {
			return
		}

		// acknowledge only confirmed feedback and preserve failed text for retry
		setIsSendingFeedback(true)
		try {
			await onSendFeedback({
				findingId: resource.findingId,
				feedback: topicFindingFeedback.trim(),
				shouldThrowOnError: true,
			})
			setIsFeedbackSent(true)
		} catch {
			showClientError("That didn't save. Carl suggests trying again.")
		} finally {
			setIsSendingFeedback(false)
		}
	}
	return (
		<View className="gap-2">
			<Text style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
				Rate this finding
			</Text>
			<View className="flex-row flex-wrap items-center gap-2">
				{isFeedbackSent ? (
					<Text
						accessibilityLiveRegion="polite"
						style={toTypeRoleStyle("caption")}
						className="flex-1 text-muted-foreground"
					>
						Noted. Carl reads these later.
					</Text>
				) : (
					<FeedbackInput
						accessibilityLabel="Feedback for Carl"
						placeholder="Tell Carl why this finding was good or bad…"
						value={topicFindingFeedback}
						onChangeText={setTopicFindingFeedback}
						style={toTypeRoleStyle("caption")}
						className={cn(
							FIELD_CLASS,
							"min-h-11 min-w-40 flex-1 rounded-lg border px-3 text-foreground placeholder:text-muted-foreground",
						)}
						returnKeyType="done"
					/>
				)}
				<RatingThumbs
					rating={resource.rating}
					isDisabled={isPending || isSendingFeedback}
					onRate={(rating) => void handleRate(rating)}
				/>
			</View>
		</View>
	)
}

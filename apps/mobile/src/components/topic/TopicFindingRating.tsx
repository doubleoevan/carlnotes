import { FINDING_RATING_NOTE_LIMIT } from "@carlnotes/contracts/payloads"
import { useFindingRatingNote } from "@carlnotes/core/hooks/useFindingRatingNote"
import { Text, View } from "react-native"
import { RatingWithFeedback } from "@/components/primitives/rating-with-feedback"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import type { TopicResourceProps } from "./TopicResource"

type TopicFindingRatingProps = Pick<TopicResourceProps, "resource" | "topicFeedHandlers" | "isPending">

/** Saves the Finding's rating and optional note using the same native field as the Journal. */
export function TopicFindingRating({ resource, topicFeedHandlers, isPending }: TopicFindingRatingProps) {
	const { findingId, rating } = resource
	const { note, setNote, toFeedback } = useFindingRatingNote(findingId, rating)
	return (
		<View className="gap-2">
			<Text style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
				Rate this finding
			</Text>
			<RatingWithFeedback
				label="Feedback for Carl"
				value={note}
				maxLength={FINDING_RATING_NOTE_LIMIT}
				rating={rating}
				isDisabled={isPending}
				onChange={setNote}
				onRate={(pressed) => {
					const feedback = toFeedback(pressed)
					topicFeedHandlers.rateTopicFinding(findingId, feedback.rating, feedback.note)
				}}
			/>
		</View>
	)
}

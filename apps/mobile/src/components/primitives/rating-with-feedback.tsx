import {
	type RatingWithFeedbackElements,
	type RatingWithFeedbackProps,
	RatingWithFeedback as SharedRatingWithFeedback,
} from "@carlnotes/core/components/RatingWithFeedback"
import { cn } from "@carlnotes/nightshift/classNames"
import { ratingWithFeedbackClasses } from "@carlnotes/nightshift/components/rating-with-feedback"
import { Text, View } from "react-native"
import { SKELETON_SHAPE_CLASS } from "@/sectionClasses"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { RatingThumbs } from "../common/RatingThumbs"
import { FeedbackInput } from "./feedback-input"

// the skeleton uses the same layout and touch-target sizes as the controls
const ROW_CLASS = cn("flex-row", ratingWithFeedbackClasses.row)
const FIELD_BOX_CLASS = cn(ratingWithFeedbackClasses.field, "min-h-11 min-w-40 rounded-lg")
const THUMB_PLACEHOLDER_CLASS = cn(SKELETON_SHAPE_CLASS, "size-11 shrink-0 rounded-md")

const ELEMENTS: RatingWithFeedbackElements = {
	Row: ({ children }) => <View className={ROW_CLASS}>{children}</View>,
	Input: (props) => <FeedbackInput {...props} className={FIELD_BOX_CLASS} />,
	Message: ({ children }) => (
		<Text
			accessibilityLiveRegion="polite"
			style={toTypeRoleStyle("caption")}
			className={ratingWithFeedbackClasses.acknowledgment}
		>
			{children}
		</Text>
	),
	Thumbs: RatingThumbs,
}

/** Draws the shared rating field with the sheet's keyboard-aware input. */
export function RatingWithFeedback(props: RatingWithFeedbackProps) {
	return <SharedRatingWithFeedback {...props} elements={ELEMENTS} />
}

/** Reserves the feedback row with the same native wrapping and touch-target sizes. */
export function RatingWithFeedbackSkeleton() {
	return (
		<View className={ROW_CLASS}>
			<View className={cn(SKELETON_SHAPE_CLASS, FIELD_BOX_CLASS)} />
			<View className={THUMB_PLACEHOLDER_CLASS} />
			<View className={THUMB_PLACEHOLDER_CLASS} />
		</View>
	)
}

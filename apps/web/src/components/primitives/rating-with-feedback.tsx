import {
	type RatingWithFeedbackElements,
	type RatingWithFeedbackProps,
	RatingWithFeedback as SharedRatingWithFeedback,
} from "@carlnotes/core/components/RatingWithFeedback"
import { cn } from "@carlnotes/nightshift/classNames"
import { ratingWithFeedbackClasses } from "@carlnotes/nightshift/components/rating-with-feedback"
import { SKELETON_SHAPE_CLASS } from "@/lib/styleClasses"
import { RatingThumbs } from "../common/RatingThumbs"
import { Input } from "./input"

// share the layout with the loading row
const ROW_CLASS = cn("flex", ratingWithFeedbackClasses.row)
const FIELD_CLASS = cn(ratingWithFeedbackClasses.field, "h-8 min-w-0")
const THUMB_PLACEHOLDER_CLASS = cn(SKELETON_SHAPE_CLASS, "size-11 shrink-0 rounded-md sm:size-9")

// use the standard input and thumbs inside the shared layout
const ELEMENTS: RatingWithFeedbackElements = {
	Row: ({ children }) => <div className={ROW_CLASS}>{children}</div>,
	Input: ({ label, placeholder, value, maxLength, isDisabled, onChange }) => (
		<Input
			aria-label={label}
			placeholder={placeholder}
			value={value}
			maxLength={maxLength}
			disabled={isDisabled}
			onChange={(event) => onChange(event.currentTarget.value)}
			className={cn(FIELD_CLASS, "text-xs")}
		/>
	),
	Message: ({ children }) => <p className={cn(ratingWithFeedbackClasses.acknowledgment, "text-xs")}>{children}</p>,
	Thumbs: RatingThumbs,
}

/** Draws the shared optional rating field with Nightshift controls. */
export function RatingWithFeedback(props: RatingWithFeedbackProps) {
	return <SharedRatingWithFeedback {...props} elements={ELEMENTS} />
}

/** Reserves the field and both thumbs while a read is pending. */
export function RatingWithFeedbackSkeleton() {
	return (
		<div className={ROW_CLASS}>
			<div className={cn(SKELETON_SHAPE_CLASS, FIELD_CLASS, "rounded-md")} />
			<div className={THUMB_PLACEHOLDER_CLASS} />
			<div className={THUMB_PLACEHOLDER_CLASS} />
		</div>
	)
}

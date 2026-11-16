import type { ComponentType, ReactNode } from "react"
import type { Rating, RatingThumbsProps } from "./RatingThumbs"

// the platform supplies its field and layout while both callers compose the same input and thumbs
export type RatingWithFeedbackElements = {
	Row: ComponentType<{ children: ReactNode }>
	Input: ComponentType<{
		label: string
		placeholder: string
		value: string
		maxLength?: number
		isDisabled?: boolean
		onChange: (text: string) => void
	}>
	Message: ComponentType<{ children: string }>
	Thumbs: ComponentType<RatingThumbsProps>
}

export type RatingWithFeedbackProps = RatingThumbsProps & {
	label: string
	placeholder?: string
	value: string
	maxLength?: number
	message?: string
	isInputDisabled?: boolean
	onChange: (text: string) => void
}

/** An already selected thumb saves an edited note or clears an unchanged vote. */
export function toRatingFeedback({
	rating,
	pressed,
	savedNote,
	note,
}: {
	rating: Rating
	pressed: Rating
	savedNote: string | null
	note: string
}): { rating: Rating; note?: string } {
	const text = note.trim()
	const nextRating = pressed === null && text !== (savedNote ?? "") ? rating : pressed
	return nextRating === null ? { rating: null } : { rating: nextRating, note: text }
}

/** Puts the optional words beside the thumbs that submit them. */
export function RatingWithFeedback({
	elements: { Row, Input, Message, Thumbs },
	label,
	placeholder = "Tell Carl why this was good or bad…",
	value,
	maxLength,
	message,
	isInputDisabled,
	onChange,
	...thumbs
}: RatingWithFeedbackProps & { elements: RatingWithFeedbackElements }) {
	return (
		<Row>
			{/* acknowledge sent feedback in place of the field when the caller supplies a message */}
			{message ? (
				<Message>{message}</Message>
			) : (
				<Input
					label={label}
					placeholder={placeholder}
					value={value}
					maxLength={maxLength}
					isDisabled={isInputDisabled}
					onChange={onChange}
				/>
			)}
			<Thumbs {...thumbs} />
		</Row>
	)
}

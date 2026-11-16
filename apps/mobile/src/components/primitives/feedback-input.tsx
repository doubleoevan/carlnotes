import type { RatingWithFeedbackElements } from "@carlnotes/core/components/RatingWithFeedback"
import { cn } from "@carlnotes/nightshift/classNames"
import { FIELD_CLASS } from "@carlnotes/nightshift/field"
import { BottomSheetTextInput } from "@gorhom/bottom-sheet"
import type { ComponentProps } from "react"
import { withUniwind } from "uniwind"
import { toTypeRoleStyle } from "@/typeRoleStyles"

const SheetTextInput = withUniwind(BottomSheetTextInput)

type FeedbackInputProps = ComponentProps<RatingWithFeedbackElements["Input"]> & { className: string }

/** Draws the keyboard-aware feedback field for findings and takeaways. */
export function FeedbackInput({
	label,
	placeholder,
	value,
	maxLength,
	isDisabled,
	onChange,
	className,
}: FeedbackInputProps) {
	return (
		<SheetTextInput
			accessibilityLabel={label}
			placeholder={placeholder}
			value={value}
			maxLength={maxLength}
			editable={!isDisabled}
			onChangeText={onChange}
			style={toTypeRoleStyle("caption")}
			className={cn(FIELD_CLASS, className, "border px-3 text-foreground placeholder:text-muted-foreground")}
			returnKeyType="done"
		/>
	)
}

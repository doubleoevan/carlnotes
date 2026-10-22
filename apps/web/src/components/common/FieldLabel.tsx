import type * as React from "react"
import { SECTION_LABEL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * The uppercase display-font label above a field, tied to it by htmlFor, or a heading over a group of fields without
 * htmlFor. The required asterisk is hidden from screen readers, so a required field marks itself.
 */
export function FieldLabel({
	children,
	htmlFor,
	isRequired,
}: {
	children: React.ReactNode
	htmlFor?: string
	isRequired?: boolean
}) {
	// the label text, then the asterisk on a required field, hidden from the field's accessible name
	const className = cn(SECTION_LABEL_CLASS, "mb-1.5 block")
	const labelContent = (
		<>
			{children}
			{isRequired && (
				<span aria-hidden="true" className="text-destructive">
					{" *"}
				</span>
			)}
		</>
	)

	// a heading over a group of fields names no single control, so it is not a label
	if (!htmlFor) {
		return <div className={className}>{labelContent}</div>
	}
	return (
		<label htmlFor={htmlFor} className={className}>
			{labelContent}
		</label>
	)
}

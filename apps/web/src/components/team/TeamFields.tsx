import type { TeamFieldElements } from "@carlnotes/core/components/TeamFields"
import { cn } from "@carlnotes/nightshift/classNames"
import { useId } from "react"
import { FieldLabel } from "@/components/common/FieldLabel"
import { Input } from "@/components/primitives/input"
import { Switch } from "@/components/primitives/switch"
import { Textarea } from "@/components/primitives/textarea"

// browser controls adapt the shared team form
export const TEAM_FIELD_ELEMENTS: TeamFieldElements = {
	Group: ({ children }) => <div>{children}</div>,
	InvitationGroup: ({ children }) => <div className="space-y-3 border-t pt-3">{children}</div>,
	Text: ({ children }) => <p className="text-muted-foreground text-sm">{children}</p>,
	Field: function TeamField({ label, value, onChange, placeholder, isMultiline, isRequired, onBlur, hasError }) {
		// tie each label to its own input in stacked dialogs
		const id = useId()
		const Control = isMultiline ? Textarea : Input
		return (
			<>
				<FieldLabel htmlFor={id} isRequired={isRequired}>
					{label}
				</FieldLabel>
				<Control
					id={id}
					aria-label={label}
					aria-required={isRequired}
					value={value}
					placeholder={placeholder}
					onChange={(event) => onChange(event.target.value)}
					onBlur={onBlur}
					className={cn(hasError && "border-destructive")}
				/>
			</>
		)
	},
	PublicChoice: ({ isPublic, onChange }) => (
		<div className="flex items-center gap-2 text-sm">
			<Switch checked={isPublic} onCheckedChange={onChange} aria-label="Public" />
			Public
		</div>
	),
}

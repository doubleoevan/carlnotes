import {
	type CreateNoteElements,
	type CreateNoteProps,
	type NoteNameInputProps,
	CreateNote as SharedCreateNote,
} from "@carlnotes/core/components/CreateNote"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { Button } from "@/components/primitives/button"
import { DialogDescription, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { isWideScreen } from "@/lib/utils"
import { NoteVisibilitySelect } from "./NoteVisibilitySelect"

// preserve the dialog's spacing and controls around shared creation state
const ELEMENTS: CreateNoteElements = {
	Title: DialogTitle,
	Fields: ({ children }) => <div className="space-y-3">{children}</div>,
	NameInput: NameInput,
	VisibilityRow: ({ children }) => <div className="flex items-center gap-3">{children}</div>,
	VisibilitySelect: NoteVisibilitySelect,
	Description: ({ children }) => <DialogDescription className="text-sm">{children}</DialogDescription>,
	Submit: ({ children, isDisabled, onPress }) => (
		<div className="flex justify-end">
			<Button disabled={isDisabled} onClick={onPress}>
				{children}
			</Button>
		</div>
	),
}

/**
 * Renders the shared creation flow inside the web note dialog.
 */
export function CreateNote(props: Omit<CreateNoteProps, "onError">) {
	return <SharedCreateNote {...props} onError={toast.error} elements={ELEMENTS} />
}

// focus a wide-screen input without opening a phone's keyboard automatically
function NameInput({ value, onChange, maxLength, label, placeholder }: NoteNameInputProps) {
	const inputRef = useRef<HTMLInputElement>(null)
	useEffect(() => {
		if (isWideScreen()) {
			inputRef.current?.focus()
		}
	}, [])
	return (
		<Input
			ref={inputRef}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			maxLength={maxLength}
			aria-label={label}
			placeholder={placeholder}
		/>
	)
}

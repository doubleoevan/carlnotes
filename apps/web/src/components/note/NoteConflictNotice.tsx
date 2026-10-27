import {
	type NoteConflictNoticeProps,
	NoteConflictNotice as SharedNoteConflictNotice,
} from "@carlnotes/core/components/NoteConflictNotice"
import type { ComponentProps } from "react"
import { Button } from "@/components/primitives/button"

// preserve the existing notice appearance around its shared copy and reload state
const ELEMENTS: ComponentProps<typeof SharedNoteConflictNotice>["elements"] = {
	Container: ({ children }) => (
		<div role="alert" className="bg-muted mb-4 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
			{children}
		</div>
	),
	Message: ({ children }) => <p className="min-w-0 flex-1">{children}</p>,
	ReloadButton: ({ children, isDisabled, onPress }) => (
		<Button size="sm" disabled={isDisabled} onClick={onPress}>
			{children}
		</Button>
	),
}

/**
 * Shows the shared conflict recovery notice using the browser's Nightshift controls.
 */
export function NoteConflictNotice(props: NoteConflictNoticeProps) {
	return <SharedNoteConflictNotice {...props} elements={ELEMENTS} />
}

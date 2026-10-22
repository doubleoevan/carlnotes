// the note dialog's create flow: a name, a visibility the creator may use, and one button

import { createNote, type NotePageRef } from "@carlnotes/client/noteClient"
import { NOTE_NAME_MAX_CHARS, type Note } from "@carlnotes/contracts/notes"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/primitives/button"
import { DialogDescription, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { isWideScreen } from "@/lib/utils"
import { type NoteVisibility, NoteVisibilitySelect, VISIBILITY_TOOLTIPS } from "./NoteVisibilitySelect"

/**
 * Renders the note dialog's create flow and calls onCreated with the new note.
 */
export function CreateNote({
	page,
	creatableVisibilities,
	onCreated,
}: {
	page: NotePageRef
	creatableVisibilities: NoteVisibility[]
	onCreated: (note: Note) => void
}) {
	// the name and visibility the create posts. default to team when that visibility is available, otherwise private
	const [name, setName] = useState("")
	const [noteVisibility, setNoteVisibility] = useState<NoteVisibility>(
		creatableVisibilities.includes("team") ? "team" : "private",
	)

	// a wide screen focuses the name on open. a phone waits for a tap.
	// focus on a phone pops the keyboard over the dialog
	const nameInputRef = useRef<HTMLInputElement>(null)
	useEffect(() => {
		if (isWideScreen()) {
			nameInputRef.current?.focus()
		}
	}, [])

	// the create itself, rejected server-side outside the creatable visibilities
	async function handleCreate() {
		const createNoteResult = await createNote(page, name.trim(), noteVisibility)
		if (!createNoteResult) {
			toast.error("Carl couldn't start that note. Try again in a moment.")
			return
		}
		onCreated(createNoteResult)
	}

	return (
		<>
			<DialogTitle>New note</DialogTitle>

			{/* the name, then the visibility with its meaning on the same row */}
			<div className="space-y-3">
				<Input
					ref={nameInputRef}
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Name your note"
					aria-label="Note name"
					maxLength={NOTE_NAME_MAX_CHARS}
				/>
				<div className="flex items-center gap-3">
					<NoteVisibilitySelect
						visibilities={creatableVisibilities}
						visibility={noteVisibility}
						onNoteVisibilityChange={setNoteVisibility}
					/>
					<DialogDescription className="text-sm">{VISIBILITY_TOOLTIPS[noteVisibility]}</DialogDescription>
				</div>
			</div>

			{/* the action, bottom-right */}
			<div className="flex justify-end">
				<Button onClick={() => void handleCreate()} disabled={name.trim().length === 0}>
					Add note
				</Button>
			</div>
		</>
	)
}

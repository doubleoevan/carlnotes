import { deleteNote, updateNote } from "@carlnotes/client/noteClient"
import type { Note, NoteVisibility } from "@carlnotes/contracts/notes"
import { useRef, useState } from "react"
import { NOTE_LABELS } from "../lib/noteLabels"

// the accepted metadata and the editor's current name
export type NoteManagement = {
	name: string
	setName: (name: string) => void
	savedName: string
	visibility: NoteVisibility
	isPending: boolean
	rename: () => Promise<void>
	changeVisibility: (visibility: NoteVisibility) => Promise<void>
	remove: () => Promise<void>
}

/**
 * Shares permission gates, pending writes, and accepted metadata across note editors.
 */
export function useNoteManagement({
	note,
	isOffline = false,
	onChanged,
	onDeleted,
	onError,
}: {
	note: Note
	isOffline?: boolean
	onChanged: (changes: Partial<Pick<Note, "name" | "visibility">>) => void
	onDeleted: () => void | Promise<void>
	onError: (message: string) => void
}): NoteManagement {
	// keep failed metadata edits visible without allowing concurrent writes to race
	const [name, setName] = useState(note.name)
	const savedName = useRef(note.name)
	const [visibility, setVisibility] = useState(note.visibility)
	const [isPending, setIsPending] = useState(false)
	const isPendingRef = useRef(false)

	// save a nonempty title and retain rejected text for retry
	async function rename(): Promise<void> {
		const nextName = name.trim()
		if (isOffline || isPendingRef.current || !note.canEdit || nextName === savedName.current) {
			return
		}
		if (!nextName) {
			setName(savedName.current)
			return
		}
		await run(async () => {
			const isSaved = await updateNote(note.id, { name: nextName }).catch(() => false)
			if (isSaved) {
				savedName.current = nextName
				setName(nextName)
				onChanged({ name: nextName })
			} else {
				onError(NOTE_LABELS.renameError)
			}
		})
	}

	// publish visibility only after the server accepts it
	async function changeVisibility(nextVisibility: NoteVisibility): Promise<void> {
		if (isOffline || isPendingRef.current || !note.isNoteOwner) {
			return
		}
		await run(async () => {
			const isSaved = await updateNote(note.id, { visibility: nextVisibility }).catch(() => false)
			if (isSaved) {
				setVisibility(nextVisibility)
				onChanged({ visibility: nextVisibility })
			} else {
				onError(NOTE_LABELS.visibilityError)
			}
		})
	}

	// close only after authorized deletion succeeds
	async function remove(): Promise<void> {
		if (isOffline || isPendingRef.current || !note.canDelete) {
			return
		}
		await run(async () => {
			const isDeleted = await deleteNote(note.id).catch(() => false)
			if (isDeleted) {
				await onDeleted()
			} else {
				onError(NOTE_LABELS.deleteError)
			}
		})
	}

	// release the guard even if a caller's post-write cleanup fails
	async function run(write: () => Promise<void>): Promise<void> {
		isPendingRef.current = true
		setIsPending(true)
		try {
			await write()
		} finally {
			isPendingRef.current = false
			setIsPending(false)
		}
	}

	return { name, setName, savedName: savedName.current, visibility, isPending, rename, changeVisibility, remove }
}

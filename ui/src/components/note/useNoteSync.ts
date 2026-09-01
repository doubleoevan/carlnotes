// the note sync lifecycle: a ydoc and provider exist only while the note is live or being edited,
// the stream pauses while the tab is hidden, and everything tears down on unmount
import { useEffect, useRef, useState } from "react"
import * as Y from "yjs"
import { NoteProvider } from "./noteProvider"

// what the editor needs from an active sync
export type NoteSync = { ydoc: Y.Doc; provider: NoteProvider }

/**
 * Hold a connected provider for a note. Null until the first effect runs.
 */
export function useNoteSync(noteId: string, onSaveError: () => void): NoteSync | null {
	// the active sync, created per note activation
	const [noteSync, setNoteSync] = useState<NoteSync | null>(null)

	// the latest onSaveError, read through a ref so a new callback identity never reconnects the stream
	const onSaveErrorRef = useRef(onSaveError)
	onSaveErrorRef.current = onSaveError

	// create on mount, destroy on unmount or a note change
	useEffect(() => {
		// the provider connects immediately and resyncs itself
		const ydoc = new Y.Doc()
		const provider = new NoteProvider(noteId, ydoc, () => onSaveErrorRef.current())
		provider.connect()
		setNoteSync({ ydoc, provider })

		// a hidden tab drops the stream, and coming back reconnects and resyncs
		const handleVisibility = (): void => {
			if (document.hidden) {
				provider.disconnect()
			} else {
				provider.connect()
			}
		}
		document.addEventListener("visibilitychange", handleVisibility)

		// the teardown ends the stream and releases the ydoc
		return () => {
			document.removeEventListener("visibilitychange", handleVisibility)
			provider.destroy()
			ydoc.destroy()
		}
	}, [noteId])
	return noteSync
}

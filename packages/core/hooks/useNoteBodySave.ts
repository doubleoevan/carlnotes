// the note body save: the schedule for one open note, a debounce after typing stops with one save on its way and one
// waiting behind it, where the note stands, the conflict a newer version returns, and the hook that reads it
import { saveNoteBody } from "@carlnotes/client/noteClient"
import type { NoteBodySaveResult, NoteConflict } from "@carlnotes/contracts/notes"
import { useEffect, useState, useSyncExternalStore } from "react"
import { toEventListeners } from "../stores/storeListeners"

// how long after the last change a save goes out
export const NOTE_SAVE_DEBOUNCE_MS = 1000

// the html the editor reports for an empty document, before it loads a body and for a note with none
export const EMPTY_EDITOR_HTML = "<html><br></html>"

// an image tag, which a note never keeps
const IMAGE_TAG_PATTERN = /<img\b[^>]*\/?>/gi

// where a note stands: saving while a save waits or is on its way, saved once the server holds the latest body, and
// unsaved after a failed save or a conflict
export type NoteSaveStatus = "saving" | "saved" | "unsaved"

// why a save failed: the api would not keep a body that large, or the save never got through
export type NoteSaveErrorReason = "tooLarge" | "failed"

// the state a subscriber reads
export type NoteBodySaveState = { status: NoteSaveStatus; conflict: NoteConflict | null }

// the schedule for one open note
export type NoteBodySave = {
	// the state, and the subscription a hook re-renders on
	getState: () => NoteBodySaveState
	subscribe: (listener: () => void) => () => void
	// take the editor's latest HTML, and save it once typing stops
	scheduleSave: (html: string) => void
	// take the editor's own rendering of the stored body as the saved one, so an untouched note schedules nothing
	setSavedHtml: (html: string) => void
	// send a waiting save now, as the editor unmounts
	flushSave: () => void
	// take the body and version a reload fetched, which ends the conflict
	resolveConflict: (html: string, version: number) => void
}

// what opens the schedule: the note, the body and version it opened at, and the save's reporting
export type ToNoteBodySaveOptions = {
	noteId: string
	html: string
	version: number
	onSaveError: (reason: NoteSaveErrorReason) => void
	// the save request. a test passes a fake
	saveBody?: typeof saveNoteBody
	debounceMs?: number
}

// what the hook returns: the state, and the schedule's calls that feed it
export type NoteBodySaveHandle = NoteBodySaveState &
	Pick<NoteBodySave, "scheduleSave" | "setSavedHtml" | "resolveConflict">

/**
 * The save schedule for the note an editor has open: its status and conflict, re-rendered on each change, and the
 * calls that feed it. Unmounting sends a waiting save, so closing the dialog keeps the last keystrokes.
 */
export function useNoteBodySave(options: ToNoteBodySaveOptions): NoteBodySaveHandle {
	// one schedule for the note's whole open, built from the options at mount
	const [noteBodySave] = useState(() => toNoteBodySave(options))
	const state = useSyncExternalStore(noteBodySave.subscribe, noteBodySave.getState, noteBodySave.getState)

	// a leaving editor's last keystrokes still save
	useEffect(() => () => noteBodySave.flushSave(), [noteBodySave])
	return {
		...state,
		scheduleSave: noteBodySave.scheduleSave,
		setSavedHtml: noteBodySave.setSavedHtml,
		resolveConflict: noteBodySave.resolveConflict,
	}
}

/**
 * Returns the save schedule for one open note. The note opens saved. Everything in it is already on the server.
 */
export function toNoteBodySave({
	noteId,
	html,
	version,
	onSaveError,
	saveBody = saveNoteBody,
	debounceMs = NOTE_SAVE_DEBOUNCE_MS,
}: ToNoteBodySaveOptions): NoteBodySave {
	// the body the server holds and its version, the body waiting to go, and the body on its way, null between saves
	let lastSavedHtml = html
	let savedVersion = version
	let pendingHtml: string | null = null
	let sendingHtml: string | null = null
	let debounceTimer: ReturnType<typeof setTimeout> | null = null

	// the state a subscriber reads, replaced whole on every change so a snapshot stays stable between changes
	let state: NoteBodySaveState = { status: "saved", conflict: null }
	const { subscribe, announce } = toEventListeners<void>()
	const setState = (nextState: NoteBodySaveState): void => {
		state = nextState
		announce()
	}

	// stop a waiting debounce
	const clearDebounce = (): void => {
		if (debounceTimer) {
			clearTimeout(debounceTimer)
			debounceTimer = null
		}
	}

	// send the waiting body. a save already on its way sends it when it returns
	const runSave = async (): Promise<void> => {
		clearDebounce()
		if (sendingHtml !== null || pendingHtml === null || state.conflict) {
			return
		}

		// take the body off the queue for the request
		const htmlToSave = pendingHtml
		pendingHtml = null
		sendingHtml = htmlToSave
		const saveResult: NoteBodySaveResult = await saveBody(noteId, { html: htmlToSave, version: savedVersion })
		sendingHtml = null

		// a saved body is the server's now. anything typed during the request goes next
		if (saveResult.status === "saved") {
			lastSavedHtml = htmlToSave
			savedVersion = saveResult.version
			if (pendingHtml !== null) {
				void runSave()
				return
			}

			// nothing is waiting, so the server holds the latest body
			setState({ status: "saved", conflict: null })
			return
		}

		// a conflict keeps the words and stops every save until the reload
		if (saveResult.status === "conflict") {
			pendingHtml = htmlToSave
			setState({
				status: "unsaved",
				conflict: { version: saveResult.version, lastEditorUsername: saveResult.lastEditorUsername },
			})
			return
		}

		// a failed save keeps the newest body waiting for the next change
		pendingHtml ??= htmlToSave
		setState({ status: "unsaved", conflict: null })
		onSaveError(saveResult.status)
	}

	return {
		getState: () => state,
		subscribe,
		scheduleSave: (nextHtml) => {
			// nothing saves past a conflict. the editor keeps the words for the person to copy
			if (state.conflict) {
				return
			}

			// a body equal to the server's, or to the one on its way there, needs no save, and cancels one waiting
			const cleanHtml = nextHtml.replace(IMAGE_TAG_PATTERN, "")
			if (cleanHtml === (sendingHtml ?? lastSavedHtml)) {
				pendingHtml = null
				clearDebounce()

				// a save still on its way reports saved itself when it returns
				if (sendingHtml === null) {
					setState({ status: "saved", conflict: null })
				}
				return
			}

			// keep the latest body and restart the debounce
			pendingHtml = cleanHtml
			if (state.status !== "saving") {
				setState({ status: "saving", conflict: null })
			}
			clearDebounce()
			debounceTimer = setTimeout(() => void runSave(), debounceMs)
		},
		setSavedHtml: (renderedHtml) => {
			lastSavedHtml = renderedHtml.replace(IMAGE_TAG_PATTERN, "")
		},
		flushSave: () => {
			void runSave()
		},
		resolveConflict: (reloadedHtml, reloadedVersion) => {
			// the reloaded body is the server's, and nothing from before the conflict is waiting
			lastSavedHtml = reloadedHtml
			savedVersion = reloadedVersion
			pendingHtml = null
			clearDebounce()
			setState({ status: "saved", conflict: null })
		},
	}
}

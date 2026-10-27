// the note body save: the schedule for one open note, a debounce after typing stops with one save on its way and one
// waiting behind it, where the note stands, the conflict a newer version returns, and the hook that reads it
import { saveNoteBody } from "@carlnotes/client/noteClient"
import type { NoteBodySaveResult, NoteConflict } from "@carlnotes/contracts/notes"
import { useEffect, useState, useSyncExternalStore } from "react"
import {
	canSaveNoteDraft,
	type NoteBodyDraft,
	type NoteSaveErrorReason,
	toNoteBodyDraft,
	toNoteDraftState,
	transitionNoteDraft,
} from "../lib/noteDrafts"

export type { NoteBodyDraft, NoteSaveErrorReason } from "../lib/noteDrafts"

import { toEventListeners } from "../stores/storeListeners"

// how long after the last change a save goes out
export const NOTE_SAVE_DEBOUNCE_MS = 1000

// the html the editor reports for an empty document, before it loads a body and for a note with none
export const EMPTY_EDITOR_HTML = "<html><br></html>"

// where a note stands: saving while a save waits or is on its way, saved once the server holds the latest body, and
// unsaved after a failed save or a conflict
export type NoteSaveStatus = "saving" | "saved" | "unsaved"

// the state a subscriber reads
export type NoteBodySaveState = { status: NoteSaveStatus; conflict: NoteConflict | null }

// the schedule for one open note
export type NoteBodySave = {
	// the state, and the subscription a hook re-renders on
	getState: () => NoteBodySaveState
	getDraft: () => NoteBodyDraft
	subscribe: (listener: () => void) => () => void
	// take the editor's latest HTML, and save it once typing stops
	scheduleSave: (html: string) => void
	// take the editor's own rendering of the stored body as the saved one, so an untouched note schedules nothing
	setSavedHtml: (html: string) => void
	// send a waiting save now, as the editor unmounts
	flushSave: () => void
	retrySave: () => void
	retire: () => void
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
	pendingDraft?: NoteBodyDraft
	onDraftChange?: (noteBodyDraft: NoteBodyDraft) => void
}

// what the hook returns: the state, and the schedule's calls that feed it
export type NoteBodySaveHandle = NoteBodySaveState &
	Pick<NoteBodySave, "scheduleSave" | "setSavedHtml" | "resolveConflict" | "flushSave" | "retrySave">

/**
 * Reads a note's save status and conflict, and flushes eligible pending work on unmount.
 */
export function useNoteBodySave(options: ToNoteBodySaveOptions & { controller?: NoteBodySave }): NoteBodySaveHandle {
	// one schedule for the note's whole open, built from the options at mount
	const [noteBodySave] = useState(() => options.controller ?? toNoteBodySave(options))
	const noteBodySaveState = useSyncExternalStore(noteBodySave.subscribe, noteBodySave.getState, noteBodySave.getState)

	// flush eligible pending work when the editor unmounts
	useEffect(() => () => noteBodySave.flushSave(), [noteBodySave])
	return {
		...noteBodySaveState,
		scheduleSave: noteBodySave.scheduleSave,
		setSavedHtml: noteBodySave.setSavedHtml,
		resolveConflict: noteBodySave.resolveConflict,
		flushSave: noteBodySave.flushSave,
		retrySave: noteBodySave.retrySave,
	}
}

/**
 * Creates a note's save controller from the server body or a recovered pending draft.
 */
export function toNoteBodySave({
	noteId,
	html,
	version,
	onSaveError,
	saveBody = saveNoteBody,
	debounceMs = NOTE_SAVE_DEBOUNCE_MS,
	pendingDraft,
	onDraftChange,
}: ToNoteBodySaveOptions): NoteBodySave {
	// keep pure transitions separate from timers, requests and subscriber notification
	let noteDraftState = toNoteDraftState(html, version, pendingDraft)
	let noteBodyDraft = toNoteBodyDraft(noteDraftState)
	let noteBodySaveState: NoteBodySaveState = {
		status: noteBodyDraft.hasPendingChanges ? "unsaved" : "saved",
		conflict: noteDraftState.conflict,
	}
	let debounceTimer: ReturnType<typeof setTimeout> | null = null
	const { subscribe, announce } = toEventListeners<void>()
	function publish(status: NoteSaveStatus): void {
		noteBodySaveState = { status, conflict: noteDraftState.conflict }
		noteBodyDraft = toNoteBodyDraft(noteDraftState)
		onDraftChange?.(noteBodyDraft)
		announce()
	}
	function clearDebounce(): void {
		if (debounceTimer) {
			clearTimeout(debounceTimer)
			debounceTimer = null
		}
	}

	// dispatch one body and apply its result to the latest local revision
	async function runSave(): Promise<void> {
		clearDebounce()
		if (!canSaveNoteDraft(noteDraftState) || noteDraftState.pendingHtml === null) {
			return
		}
		const htmlToSave = noteDraftState.pendingHtml
		noteDraftState = transitionNoteDraft(noteDraftState, { type: "start" })
		publish("saving")
		const saveNoteBodyResult: NoteBodySaveResult = await saveBody(noteId, {
			html: htmlToSave,
			version: noteDraftState.savedVersion,
		}).catch(() => ({ status: "failed" }))
		if (noteDraftState.isRetired) {
			return
		}
		noteDraftState = transitionNoteDraft(noteDraftState, {
			type: "result",
			html: htmlToSave,
			result: saveNoteBodyResult,
		})
		finishSave(saveNoteBodyResult)
	}

	// notify transport failures once and dispatch only accepted follow-up revisions
	function finishSave(saveNoteBodyResult: NoteBodySaveResult): void {
		if (saveNoteBodyResult.status === "saved") {
			publish(noteDraftState.pendingHtml === null ? "saved" : "saving")
			if (noteDraftState.pendingHtml !== null) {
				void runSave()
			}
			return
		}
		publish("unsaved")
		if (saveNoteBodyResult.status !== "conflict") {
			onSaveError(saveNoteBodyResult.status)
			if (noteDraftState.errorReason === null) {
				void runSave()
			}
		}
	}

	return {
		getState: () => noteBodySaveState,
		getDraft: () => noteBodyDraft,
		subscribe,
		scheduleSave: (nextHtml) => {
			if (noteDraftState.isRetired) {
				return
			}
			noteDraftState = transitionNoteDraft(noteDraftState, { type: "edit", html: nextHtml })
			clearDebounce()
			if (
				noteDraftState.conflict ||
				noteDraftState.errorReason === "tooLarge" ||
				noteDraftState.errorReason === "unavailable"
			) {
				publish("unsaved")
				return
			}
			publish(noteDraftState.pendingHtml === null && noteDraftState.sendingHtml === null ? "saved" : "saving")
			if (noteDraftState.pendingHtml !== null) {
				debounceTimer = setTimeout(() => void runSave(), debounceMs)
			}
		},
		setSavedHtml: (renderedHtml) => {
			noteDraftState = transitionNoteDraft(noteDraftState, { type: "baseline", html: renderedHtml })
			noteBodyDraft = toNoteBodyDraft(noteDraftState)
		},
		flushSave: () => {
			void runSave()
		},
		retrySave: () => {
			void runSave()
		},
		retire: () => {
			noteDraftState = transitionNoteDraft(noteDraftState, { type: "retire" })
			clearDebounce()
		},
		resolveConflict: (reloadedHtml, reloadedVersion) => {
			if (noteDraftState.isRetired) {
				return
			}
			noteDraftState = transitionNoteDraft(noteDraftState, {
				type: "reload",
				html: reloadedHtml,
				version: reloadedVersion,
			})
			clearDebounce()
			publish("saved")
		},
	}
}

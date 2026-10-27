import { fetchNote, fetchNotes, NoteReadError } from "@carlnotes/client/noteClient"
import type { NoteResponse } from "@carlnotes/contracts/notes"
import type { NoteDraftContext } from "@carlnotes/core/lib/noteDrafts"
import type { NoteDraftStore } from "./stores/noteDraftStore"

// a server-authorized note or the active account's recoverable draft
export type OpenedNote = { note: NoteResponse; context: NoteDraftContext; isOffline: boolean }
type LoadNoteOptions = {
	store: NoteDraftStore | null
	page: Pick<NoteDraftContext, "pageType" | "pageId">
	noteId: string
	isOnline: boolean
}

/**
 * Validates a note and its page membership before recovering any account-local draft.
 */
export async function loadNote(options: LoadNoteOptions): Promise<OpenedNote | null> {
	// recover offline content only from this account and this page
	const { store, page, noteId, isOnline } = options
	if (!isOnline) {
		return recoverNoteOrThrow(options, new Error("note unavailable offline"))
	}

	// retain both results so an availability failure cannot hide a confirmed denial
	const [noteRead, pageRead] = await Promise.allSettled([
		fetchNote(noteId, { shouldThrowOnError: true }),
		fetchNotes(page, { shouldThrowOnError: true }),
	])
	const isNoteDenied = noteRead.status === "fulfilled" && !noteRead.value
	const isPageDenied = pageRead.status === "fulfilled" && !pageRead.value?.notes.some((note) => note.id === noteId)
	const isSignedOut = [noteRead, pageRead].some(
		(read) => read.status === "rejected" && read.reason instanceof NoteReadError && read.reason.status === 401,
	)
	if (isNoteDenied || isPageDenied || isSignedOut) {
		await store?.remove(noteId)
		return null
	}

	// a known editing revocation also retires the draft when the page request failed
	if (noteRead.status === "fulfilled" && !noteRead.value?.canEdit) {
		await store?.remove(noteId)
	}
	const rejectedRead = [noteRead, pageRead].find((read) => read.status === "rejected")
	if (rejectedRead) {
		return recoverNoteOrThrow(options, rejectedRead.reason)
	}

	// both successful reads must authorize the same note before server content is shown
	const note = noteRead.status === "fulfilled" ? noteRead.value : null
	const notes = pageRead.status === "fulfilled" ? pageRead.value : null
	if (!note || !notes) {
		return null
	}
	return {
		note,
		context: { ...page, pageName: notes.pageName, creatableVisibilities: notes.creatableVisibilities },
		isOffline: false,
	}
}

// match the owning page as well as the note before reading its durable text
function recoverNote({ store, page, noteId }: LoadNoteOptions): OpenedNote | null {
	const record = store
		?.getSnapshot()
		.notes.find((entry) => entry.note.id === noteId && entry.pageType === page.pageType && entry.pageId === page.pageId)
	const note = record && store?.getRecoveredNote(noteId)
	return record && note ? { note, context: record, isOffline: true } : null
}

// preserve the transport error when this account has no recoverable draft
function recoverNoteOrThrow(options: LoadNoteOptions, error: unknown): OpenedNote {
	const recoveredNote = recoverNote(options)
	if (recoveredNote) {
		return recoveredNote
	}
	throw error
}

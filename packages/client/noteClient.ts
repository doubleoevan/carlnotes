// the api client for notes: the page's note list, the note lifecycle, the body save, the comment thread, and the
// badges
import type { noteVisibilities } from "@carlnotes/contracts/enums"
import {
	type Note,
	type NoteBadge,
	type NoteBodySaveResult,
	type NoteComment,
	type NoteResponse,
	type NotesResponse,
	note,
	noteBadgesResponse,
	noteBodyConflictResponse,
	noteBodyResponse,
	noteComment,
	noteCommentsResponse,
	noteResponse,
	notesResponse,
} from "@carlnotes/contracts/notes"
import { type ApiResponse, apiClient, readApiResponse } from "./apiClient"

// a note visibility and a note page reference
type NoteVisibility = (typeof noteVisibilities)[number]
export type NotePageRef = { pageType: "topic" | "team"; pageId: string }
type NoteReadOptions = { shouldThrowOnError?: boolean }

// a rejected read keeps its status so recovery can distinguish access from availability
export class NoteReadError extends Error {
	constructor(readonly status: number) {
		super(`The note request failed (${status}).`)
		this.name = "NoteReadError"
	}
}

/**
 * Reads a page's notes, optionally rejecting unavailable reads instead of returning null.
 */
export async function fetchNotes(page: NotePageRef, options: NoteReadOptions = {}): Promise<NotesResponse | null> {
	// request the page's visible notes and creation permissions
	const response =
		page.pageType === "topic"
			? await apiClient().api.topics[":id"].notes.$get({ param: { id: page.pageId } })
			: await apiClient().api.teams[":id"].notes.$get({ param: { id: page.pageId } })
	if (!response.ok) {
		throwFailedNoteRead(response, options)
		return null
	}

	// the payload is the visible notes and the creatable visibilities
	return readApiResponse(notesResponse, response)
}

/**
 * Creates one note on the page.
 */
export async function createNote(page: NotePageRef, name: string, visibility: NoteVisibility): Promise<Note | null> {
	const response =
		page.pageType === "topic"
			? await apiClient().api.topics[":id"].notes.$post({
					param: { id: page.pageId },
					json: { name, visibility },
				})
			: await apiClient().api.teams[":id"].notes.$post({
					param: { id: page.pageId },
					json: { name, visibility },
				})
	if (!response.ok) {
		return null
	}

	// the created row, owned by the caller
	return readApiResponse(note, response)
}

/**
 * Reads a note's body and permissions, optionally preserving transport and server failures.
 */
export async function fetchNote(noteId: string, options: NoteReadOptions = {}): Promise<NoteResponse | null> {
	try {
		// distinguish a missing or forbidden note from a failed read
		const response = await apiClient().api.notes[":id"].$get({ param: { id: noteId } })
		if (!response.ok) {
			throwFailedNoteRead(response, options)
			return null
		}

		// the note with its body and version, awaited so a parse error reaches the catch below
		return await readApiResponse(noteResponse, response)
	} catch (error) {
		if (options.shouldThrowOnError) {
			throw error
		}
		return null
	}
}

/**
 * Renames a note or changes its visibility. The api rejects what the caller's role does not allow.
 */
export async function updateNote(
	noteId: string,
	changes: { name?: string; visibility?: NoteVisibility },
): Promise<boolean> {
	const response = await apiClient().api.notes[":id"].$patch({ param: { id: noteId }, json: changes })
	return response.ok
}

/**
 * Deletes a note when the server grants deletion permission.
 */
export async function deleteNote(noteId: string): Promise<boolean> {
	const response = await apiClient().api.notes[":id"].$delete({ param: { id: noteId } })
	return response.ok
}

/**
 * Saves a note's body at the version the editor opened at. A request that never arrives counts as failed.
 */
export async function saveNoteBody(
	noteId: string,
	bodySave: { html: string; version: number },
): Promise<NoteBodySaveResult> {
	// a thrown fetch error reads as a failed save
	try {
		const response = await apiClient().api.notes[":id"].body.$put({ param: { id: noteId }, json: bodySave })

		// a conflict names the newer version and who saved it
		const status: number = response.status
		if (status === 409) {
			const conflict = await readApiResponse(noteBodyConflictResponse, response)
			return { status: "conflict", version: conflict.version, lastEditorUsername: conflict.lastEditorUsername }
		}

		// the body limit returns 413 and the payload's own limit 400. any other error is a failed save
		if (status === 413 || status === 400) {
			return { status: "tooLarge" }
		}

		// a note the user may not save, or one that is gone, is unavailable
		if (status === 401 || status === 403 || status === 404) {
			return { status: "unavailable" }
		}
		if (!response.ok) {
			return { status: "failed" }
		}

		// a kept body comes back with the version it is stored at
		return { status: "saved", version: (await readApiResponse(noteBodyResponse, response)).version }
	} catch {
		return { status: "failed" }
	}
}

/**
 * Reads the oldest-first comment thread and rejects failed requests.
 */
export async function fetchNoteComments(noteId: string): Promise<NoteComment[]> {
	// a failed read must not look like an empty thread
	const response = await apiClient().api.notes[":id"].comments.$get({ param: { id: noteId } })
	if (!response.ok) {
		throw new NoteReadError(response.status)
	}
	return (await readApiResponse(noteCommentsResponse, response)).comments
}

/**
 * Posts one comment on the note's thread. Any error status, or a request that never arrives, returns null.
 */
export async function postNoteComment(noteId: string, body: string): Promise<NoteComment | null> {
	try {
		const response = await apiClient().api.notes[":id"].comments.$post({ param: { id: noteId }, json: { body } })
		if (!response.ok) {
			return null
		}

		// the posted comment as the thread shows it, awaited so a parse error reaches the catch below
		return await readApiResponse(noteComment, response)
	} catch {
		return null
	}
}

/**
 * Deletes one of the user's own comments. A request that never arrives reads as not deleted.
 */
export async function deleteNoteComment(noteId: string, commentId: string): Promise<boolean> {
	try {
		// whether the api removed the row
		const response = await apiClient().api.notes[":id"].comments[":commentId"].$delete({
			param: { id: noteId, commentId },
		})
		return response.ok
	} catch {
		return false
	}
}

/**
 * Reads unread note counts and rejects failed requests so confirmed counts remain visible.
 */
export async function fetchNoteBadges(): Promise<NoteBadge[]> {
	// reject failures without replacing the last confirmed counts
	const response = await apiClient().api["note-badges"].$get()
	if (!response.ok) {
		throw new NoteReadError(response.status)
	}

	// the payload holds only the notes with unread edits or comments
	return (await readApiResponse(noteBadgesResponse, response)).badges
}

/**
 * Records a note read and returns whether the server acknowledged it.
 */
export async function sendNoteRead(noteId: string): Promise<boolean> {
	try {
		// wait for acceptance before treating a read as confirmed
		const response = await apiClient().api.notes[":id"].read.$post({ param: { id: noteId } })
		return response.ok
	} catch {
		return false
	}
}

// leave missing and forbidden notes unavailable, and optionally reject other failed reads
function throwFailedNoteRead(response: ApiResponse, options: NoteReadOptions): void {
	if (options.shouldThrowOnError && response.status !== 404 && response.status !== 403) {
		throw new NoteReadError(response.status)
	}
}

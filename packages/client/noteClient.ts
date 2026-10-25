// the api client for notes: the page's note list, the note lifecycle, the body save, the comment thread, and the
// badges

import type { noteVisibilities } from "@carlnotes/contracts/enums"
import type {
	Note,
	NoteBadge,
	NoteBodyConflictResponse,
	NoteBodyResponse,
	NoteBodySaveResult,
	NoteComment,
	NoteResponse,
	NotesResponse,
} from "@carlnotes/contracts/notes"
import { apiClient } from "./apiClient"

// a note visibility and a note page reference
type NoteVisibility = (typeof noteVisibilities)[number]
export type NotePageRef = { pageType: "topic" | "team"; pageId: string }

/**
 * The notes payload for a page. Any error status returns null.
 */
export async function fetchNotes(page: NotePageRef): Promise<NotesResponse | null> {
	const response =
		page.pageType === "topic"
			? await apiClient().api.topics[":id"].notes.$get({ param: { id: page.pageId } })
			: await apiClient().api.teams[":id"].notes.$get({ param: { id: page.pageId } })
	if (!response.ok) {
		return null
	}

	// the payload is the visible notes and the creatable visibilities
	return (await response.json()) as NotesResponse
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
	return (await response.json()) as Note
}

/**
 * One note for its dialog, with the stored HTML body and the version a save names. Any error status, or a request that
 * never arrives, returns null.
 */
export async function fetchNote(noteId: string): Promise<NoteResponse | null> {
	try {
		const response = await apiClient().api.notes[":id"].$get({ param: { id: noteId } })
		if (!response.ok) {
			return null
		}

		// the note with its body and version
		return (await response.json()) as NoteResponse
	} catch {
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
 * Deletes a note. Only the owner may.
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
			const conflict = (await response.json()) as NoteBodyConflictResponse
			return { status: "conflict", version: conflict.version, lastEditorUsername: conflict.lastEditorUsername }
		}

		// the body limit returns 413 and the payload's own limit 400. any other error is a failed save
		if (status === 413 || status === 400) {
			return { status: "tooLarge" }
		}
		if (!response.ok) {
			return { status: "failed" }
		}

		// a kept body comes back with the version it is stored at
		return { status: "saved", version: ((await response.json()) as NoteBodyResponse).version }
	} catch {
		return { status: "failed" }
	}
}

/**
 * The note's comment thread, oldest first. Any error status, or a request that never arrives, returns an empty list.
 */
export async function fetchNoteComments(noteId: string): Promise<NoteComment[]> {
	try {
		const response = await apiClient().api.notes[":id"].comments.$get({ param: { id: noteId } })
		if (!response.ok) {
			return []
		}

		// the thread as the api lists it
		return ((await response.json()) as { comments: NoteComment[] }).comments
	} catch {
		return []
	}
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

		// the posted comment as the thread shows it
		return (await response.json()) as NoteComment
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
 * Every unread note count the signed-in user has. Any error status returns an empty list.
 */
export async function fetchNoteBadges(): Promise<NoteBadge[]> {
	const response = await apiClient().api["note-badges"].$get()
	if (!response.ok) {
		return []
	}

	// the payload holds only the notes with unread edits or comments
	const payload = (await response.json()) as { badges: NoteBadge[] }
	return payload.badges
}

/**
 * Marks a note read, which clears both of its counts.
 */
export async function sendNoteRead(noteId: string): Promise<void> {
	await apiClient().api.notes[":id"].read.$post({ param: { id: noteId } })
}

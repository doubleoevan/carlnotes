// the api client for notes: the page's note list, the note lifecycle, the ydoc sync, the stream url,
// and the comment users
import type { Note, NoteBadge, NoteCommentUser, NoteResponse, NotesResponse } from "@shared/contracts"
import type { noteVisibilities } from "@shared/enums"
import { hc } from "hono/client"
import type { AppType } from "../../../api"

// same-origin api client on a relative base url
const apiClient = hc<AppType>("")

// a note visibility and a note page reference
type NoteVisibility = (typeof noteVisibilities)[number]
export type NotePageRef = { pageType: "topic" | "team"; pageId: string }

/**
 * The notes payload for a page. Any error status returns null.
 */
export async function fetchNotes(page: NotePageRef): Promise<NotesResponse | null> {
	const response =
		page.pageType === "topic"
			? await apiClient.api.topics[":id"].notes.$get({ param: { id: page.pageId } })
			: await apiClient.api.teams[":id"].notes.$get({ param: { id: page.pageId } })
	if (!response.ok) {
		return null
	}

	// the payload is the visible notes and the creatable visibilities
	return (await response.json()) as NotesResponse
}

/**
 * Create one note on the page.
 */
export async function createNote(page: NotePageRef, name: string, visibility: NoteVisibility): Promise<Note | null> {
	const response =
		page.pageType === "topic"
			? await apiClient.api.topics[":id"].notes.$post({
					param: { id: page.pageId },
					json: { name, visibility },
				})
			: await apiClient.api.teams[":id"].notes.$post({
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
 * One note for its dialog, with the stored HTML a read-only open renders.
 */
export async function fetchNote(noteId: string): Promise<NoteResponse | null> {
	const response = await apiClient.api.notes[":id"].$get({ param: { id: noteId } })
	if (!response.ok) {
		return null
	}
	return (await response.json()) as NoteResponse
}

/**
 * Rename a note or change its visibility. The api rejects what the caller's role does not allow.
 */
export async function updateNote(
	noteId: string,
	changes: { name?: string; visibility?: NoteVisibility },
): Promise<boolean> {
	const response = await apiClient.api.notes[":id"].$patch({ param: { id: noteId }, json: changes })
	return response.ok
}

/**
 * Delete a note. Only the owner may.
 */
export async function deleteNote(noteId: string): Promise<boolean> {
	const response = await apiClient.api.notes[":id"].$delete({ param: { id: noteId } })
	return response.ok
}

/**
 * The note document as yjs update bytes: the full document, or the diff against the given state vector.
 */
export async function fetchNoteYdoc(noteId: string, stateVector: Uint8Array | null): Promise<Uint8Array | null> {
	// the snapshot is raw bytes, so this is a plain fetch instead of the typed client
	const stateVectorQuery = stateVector ? `?sv=${encodeURIComponent(toBase64(stateVector))}` : ""
	const response = await fetch(`/api/notes/${noteId}/ydoc${stateVectorQuery}`)
	if (!response.ok) {
		return null
	}
	return new Uint8Array(await response.arrayBuffer())
}

/**
 * Post one yjs update for the server to merge. "rejected" is the server rejecting this exact update, which no retry can ever send.
 */
export async function sendNoteUpdate(noteId: string, update: Uint8Array): Promise<boolean | "rejected"> {
	const response = await apiClient.api.notes[":id"].updates.$post({
		param: { id: noteId },
		json: { update: toBase64(update) },
	})
	if (response.status === 400) {
		return "rejected"
	}
	return response.ok
}

/**
 * The stream url that the note's EventSource connects to.
 */
export function toNoteEventsUrl(noteId: string): string {
	return `/api/notes/${noteId}/events`
}

/**
 * The base url the editor's REST thread store sends comment writes to.
 */
export function toNoteThreadsUrl(noteId: string): string {
	return `/api/notes/${noteId}/threads`
}

/**
 * The comment authors' usernames and avatars for the editor's resolveUsers.
 */
export async function fetchNoteUsers(noteId: string, userIds: string[]): Promise<NoteCommentUser[]> {
	const response = await apiClient.api.notes[":id"].users.$get({
		param: { id: noteId },
		query: { ids: userIds.join(",") },
	})
	if (!response.ok) {
		return []
	}
	return ((await response.json()) as { users: NoteCommentUser[] }).users
}

/**
 * Encode bytes as base64 in the browser.
 */
function toBase64(bytes: Uint8Array): string {
	// build the binary string in chunks so a large update never overflows the argument list
	let binary = ""
	const chunkSize = 0x8000
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
	}
	return btoa(binary)
}

/**
 * Decode base64 back to bytes.
 */
export function fromBase64(encoded: string): Uint8Array {
	const binary = atob(encoded)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index)
	}
	return bytes
}

/**
 * Every unread note count the signed-in user has. Any error status returns an empty list.
 */
export async function fetchNoteBadges(): Promise<NoteBadge[]> {
	const response = await apiClient.api["note-badges"].$get()
	if (!response.ok) {
		return []
	}

	// the payload holds only the notes with unread edits or comments
	const payload = (await response.json()) as { badges: NoteBadge[] }
	return payload.badges
}

/**
 * Mark a note read, which clears both of its counts.
 */
export async function sendNoteRead(noteId: string): Promise<void> {
	await apiClient.api.notes[":id"].read.$post({ param: { id: noteId } })
}

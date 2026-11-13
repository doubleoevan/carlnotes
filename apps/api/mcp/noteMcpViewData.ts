// the note MCP view's data: a page's notes in the site's shape, and the note a call opened or saved, beside the
// caller's identity

import type { NoteResponse, NotesResponse } from "@carlnotes/contracts/notes"
import { loadNotesPayload, loadVisibleNote, toNoteResponse, type VisibleNote } from "../note/notePayloads"
import { type NotePage, toNotePageLink } from "../note/permissions"
import { loadMcpViewSession, toMcpViewMeta } from "./mcpViewData"
import type { ToolCaller } from "./toolCaller"

/**
 * Returns a page's notes as the note MCP view reads them, with the note it opens or null for the list.
 */
export async function toNoteMcpViewMeta({
	toolCaller,
	page,
	notesResponse,
	openedNote,
}: {
	toolCaller: ToolCaller
	// the page and the notes the caller may see on it
	page: NotePage
	notesResponse: NotesResponse
	openedNote: NoteResponse | null
}): Promise<Record<string, unknown>> {
	// the page by its kind and id, which the view links to
	return toMcpViewMeta({
		session: await loadMcpViewSession(toolCaller),
		podcastEpisodes: [],
		notes: { pageType: page.kind, pageId: toNotePageLink(page).id, notesResponse, openedNote },
	})
}

/**
 * Returns an opened note's MCP view data beside its page's notes, or undefined for a page the caller no longer sees.
 */
export async function loadOpenedNoteMcpViewMeta({
	toolCaller,
	visibleNote,
	openedNote,
}: {
	toolCaller: ToolCaller
	// the note as the caller may see it, and as the site shows it
	visibleNote: VisibleNote
	openedNote: NoteResponse
}): Promise<Record<string, unknown> | undefined> {
	const notesResponse = await loadNotesPayload(visibleNote.userId, visibleNote.page)
	return notesResponse
		? await toNoteMcpViewMeta({ toolCaller, page: visibleNote.page, notesResponse, openedNote })
		: undefined
}

/**
 * Returns a saved note's MCP view data as the note stands after the save, or undefined for a note it cannot read.
 */
export async function loadSavedNoteMcpViewMeta({
	toolCaller,
	userId,
	noteId,
}: {
	toolCaller: ToolCaller
	// the account that saved, and the note it saved
	userId: string
	noteId: string
}): Promise<Record<string, unknown> | undefined> {
	const visibleNote = await loadVisibleNote(userId, noteId)
	return visibleNote
		? await loadOpenedNoteMcpViewMeta({ toolCaller, visibleNote, openedNote: await toNoteResponse(visibleNote) })
		: undefined
}

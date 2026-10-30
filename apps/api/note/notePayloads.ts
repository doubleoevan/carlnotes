// the note payloads: a page's note list, one visible note shaped for the api, and a note created on a page
import type { Note, NotesResponse } from "@carlnotes/contracts/notes"
import { db } from "@carlnotes/db"
import { toUnreportedFilter } from "@carlnotes/db/contentFilters"
import { notes } from "@carlnotes/db/schema/notes"
import { users } from "@carlnotes/db/schema/users"
import { and, eq, ne, or } from "drizzle-orm"
import type { Context } from "hono"
import { currentUser } from "../currentUser"
import { loadUsername } from "../usernames"
import {
	canDeleteNote,
	canEditNote,
	canSeeNote,
	creatableNoteVisibilities,
	loadNoteWithPage,
	loadPageAccess,
	type NotePage,
	type NoteRow,
	type PageAccess,
} from "./permissions"

// the columns a note list reads: everything but the body, which only an opened note loads
const noteListColumns = {
	id: notes.id,
	topicId: notes.topicId,
	teamId: notes.teamId,
	name: notes.name,
	visibility: notes.visibility,
	ownerUserId: notes.ownerUserId,
	createdAt: notes.createdAt,
	updatedAt: notes.updatedAt,
}
type NoteListRow = Pick<NoteRow, keyof typeof noteListColumns>

/**
 * Loads the visible note with its page, or null if the user may not see the note.
 */
export async function loadVisibleNote(
	context: Context,
	noteId: string,
): Promise<{ note: NoteRow; access: PageAccess; userId: string | null } | null> {
	// the row and its page. a note the user reported reads as missing to them
	const userId = currentUser(context)
	const noteWithPage = await loadNoteWithPage(noteId, userId)
	if (!noteWithPage) {
		return null
	}

	// the page access decides the read
	const access = await loadPageAccess(userId, noteWithPage.page)
	if (!canSeeNote(userId, noteWithPage.note, access)) {
		return null
	}
	return { note: noteWithPage.note, access, userId }
}

/**
 * Returns one note row shaped for the api.
 */
export function toNote(
	note: NoteListRow,
	userId: string | null,
	access: PageAccess,
	// the owner's current username, null once the account closed
	ownerUsername: string | null,
): Note {
	return {
		id: note.id,
		name: note.name,
		visibility: note.visibility,
		createdAt: note.createdAt.toISOString(),
		updatedAt: note.updatedAt.toISOString(),
		canEdit: canEditNote(userId, note, access),
		isNoteOwner: userId !== null && note.ownerUserId === userId,
		canDelete: canDeleteNote(userId, note, access),
		owner: ownerUsername ? { id: note.ownerUserId, username: ownerUsername } : null,
	}
}

/**
 * Loads the notes payload for a page, the visible notes newest first, or null if the user may not see the page.
 */
export async function loadNotesPayload(userId: string | null, page: NotePage): Promise<NotesResponse | null> {
	// no visible page means no note at all, though an admin still reads one they could not otherwise open
	const pageAccess = await loadPageAccess(userId, page)
	if (!pageAccess.canSeePage && !pageAccess.isAdmin) {
		return null
	}

	// the page's rows without their bodies. private rows narrow to the user's own in sql, the visibility rules finish
	// in code
	const pageFilter = page.kind === "topic" ? eq(notes.topicId, page.topic.id) : eq(notes.teamId, page.team.id)
	const privateFilter = pageAccess.isAdmin
		? undefined
		: or(ne(notes.visibility, "private"), eq(notes.ownerUserId, userId ?? ""))
	// a signed-in user's list leaves out the notes they reported
	const reportFilter = userId ? toUnreportedFilter(userId, "note", notes.id) : undefined
	const noteRows = await db
		.select({ ...noteListColumns, ownerUsername: users.username })
		.from(notes)
		.leftJoin(users, eq(users.id, notes.ownerUserId))
		.where(and(pageFilter, privateFilter, reportFilter))
	const visibleNotes = noteRows.filter((noteRow) => canSeeNote(userId, noteRow, pageAccess))

	// newest first
	const sortedNotes = visibleNotes.sort(
		(firstNote, secondNote) => secondNote.updatedAt.getTime() - firstNote.updatedAt.getTime(),
	)
	return {
		pageName: page.kind === "topic" ? page.topic.name : page.team.name,
		creatableVisibilities: creatableNoteVisibilities(userId, pageAccess),
		notes: sortedNotes.map((noteRow) => toNote(noteRow, userId, pageAccess, noteRow.ownerUsername)),
	}
}

/**
 * Creates one note on a page, or returns null outside the creator's creatable visibilities.
 */
export async function createNote(
	userId: string | null,
	page: NotePage,
	name: string,
	visibility: NoteRow["visibility"],
): Promise<Note | null> {
	// the visibility must be one the creator may use
	const access = await loadPageAccess(userId, page)
	if (!userId || !creatableNoteVisibilities(userId, access).includes(visibility)) {
		return null
	}

	// insert the note with an empty body at version 1, saved as edited by its creator
	const pageColumns = page.kind === "topic" ? { topicId: page.topic.id } : { teamId: page.team.id }
	const [noteRow] = await db
		.insert(notes)
		.values({
			...pageColumns,
			name,
			visibility,
			ownerUserId: userId,
			lastEditorUserId: userId,
			bodyEditedAt: new Date(),
		})
		.returning()
	return noteRow ? toNote(noteRow, userId, access, await loadUsername(userId)) : null
}

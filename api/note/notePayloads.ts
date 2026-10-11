// the note payloads: a page's note list, one visible note shaped for the api, and a note created on a page
import type { Note, NotesResponse } from "@shared/contracts/notes"
import { and, eq, inArray, ne, or } from "drizzle-orm"
import type { Context } from "hono"
import { db } from "../../db"
import { notes } from "../../db/schema/notes"
import { teamMembers, teamTopics } from "../../db/schema/teams"
import { users } from "../../db/schema/users"
import { currentUser } from "../currentUser"
import { emptyNoteYdoc } from "./noteYdoc"
import {
	canDeleteNote,
	canEditNote,
	canSeeNote,
	creatableNoteVisibilities,
	loadNoteWithPage,
	loadPageAccess,
	type NotePage,
	type PageAccess,
} from "./permissions"

// one note row as the notes table stores it
type NoteRow = typeof notes.$inferSelect

/**
 * Loads the visible note with its page, or null if the user may not see the note.
 */
export async function loadVisibleNote(
	context: Context,
	noteId: string,
): Promise<{ note: NoteRow; access: PageAccess; userId: string | null } | null> {
	// the row and its page
	const userId = currentUser(context)
	const noteWithPage = await loadNoteWithPage(noteId)
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
export function toNote(note: NoteRow, userId: string | null, access: PageAccess): Note {
	return {
		id: note.id,
		name: note.name,
		visibility: note.visibility,
		createdAt: note.createdAt.toISOString(),
		updatedAt: note.updatedAt.toISOString(),
		canEdit: canEditNote(userId, note, access),
		isTopicOwner: userId !== null && note.ownerUserId === userId,
		canDelete: canDeleteNote(userId, note, access),
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

	// the page's rows. private rows narrow to the user's own in sql, the visibility rules finish in code
	const pageFilter = page.kind === "topic" ? eq(notes.topicId, page.topic.id) : eq(notes.teamId, page.team.id)
	const privateFilter = pageAccess.isAdmin
		? undefined
		: or(ne(notes.visibility, "private"), eq(notes.ownerUserId, userId ?? ""))
	const noteRows = await db.select().from(notes).where(and(pageFilter, privateFilter))
	const visibleNotes = noteRows.filter((noteRow) => canSeeNote(userId, noteRow, pageAccess))

	// newest first
	const sortedNotes = visibleNotes.sort(
		(firstNote, secondNote) => secondNote.updatedAt.getTime() - firstNote.updatedAt.getTime(),
	)
	return {
		pageName: page.kind === "topic" ? page.topic.name : page.team.name,
		creatableVisibilities: creatableNoteVisibilities(userId, pageAccess),
		mentionableUsernames: await loadMentionableUsernames(userId, page),
		notes: sortedNotes.map((noteRow) => toNote(noteRow, userId, pageAccess)),
	}
}

// who a comment may mention. the active members of every team holding the page, minus the commenter
async function loadMentionableUsernames(userId: string | null, page: NotePage): Promise<string[]> {
	const teamIds = userId ? await loadHoldingTeamIds(page) : []
	if (teamIds.length === 0) {
		return []
	}

	// alphabetical. a user in two holding teams appears once
	const memberRows = await db
		.select({ username: users.username })
		.from(teamMembers)
		.innerJoin(users, eq(users.id, teamMembers.userId))
		.where(
			and(inArray(teamMembers.teamId, teamIds), eq(teamMembers.isActive, true), ne(teamMembers.userId, userId ?? "")),
		)
	return [...new Set(memberRows.map((memberRow) => memberRow.username))].sort()
}

// the teams holding the page. a team page is its own, and a topic is held through its own team
// column or a share
async function loadHoldingTeamIds(page: NotePage): Promise<string[]> {
	if (page.kind === "team") {
		return [page.team.id]
	}

	// the shares, then both paths folded together with the nulls dropped
	const sharedRows = await db
		.select({ teamId: teamTopics.teamId })
		.from(teamTopics)
		.where(eq(teamTopics.topicId, page.topic.id))
	const sharedTeamIds = sharedRows.map((sharedRow) => sharedRow.teamId)
	return [...new Set([page.topic.teamId, ...sharedTeamIds].filter((teamId) => teamId !== null))]
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

	// insert the note with an empty document, saved as edited by its creator
	const pageColumns = page.kind === "topic" ? { topicId: page.topic.id } : { teamId: page.team.id }
	const [noteRow] = await db
		.insert(notes)
		.values({
			...pageColumns,
			name,
			visibility,
			ownerUserId: userId,
			ydoc: emptyNoteYdoc(),
			lastEditorUserId: userId,
			bodyEditedAt: new Date(),
		})
		.returning()
	return noteRow ? toNote(noteRow, userId, access) : null
}

// the note writes: create on a page, rename and visibility, delete, and the body save at the version the editor
// opened at. every access rejection reads as a missing note
import type { ModerationCategory } from "@carlnotes/contracts/moderation"
import type { Note, NoteBodySaveResult } from "@carlnotes/contracts/notes"
import { toHtmlText } from "@carlnotes/contracts/text"
import { db } from "@carlnotes/db"
import { notes } from "@carlnotes/db/schema/notes"
import { users } from "@carlnotes/db/schema/users"
import { and, eq, sql } from "drizzle-orm"
import { toObjectionableCategory } from "../moderation"
import { sanitizeNoteHtml } from "../noteHtml"
import { createNote, loadVisibleNote } from "./notePayloads"
import {
	canDeleteNote,
	canEditNote,
	creatableNoteVisibilities,
	loadTeamPage,
	loadTopicPage,
	type NoteRow,
} from "./permissions"

// why a note write saved nothing: no visible note the user may change, an account behind on the Terms, or a text that
// reads as a violation
export type NoteWriteRejection =
	| { status: "notFound" }
	| { status: "termsOutdated" }
	| { status: "objectionable"; category: ModerationCategory }

// the account a note write runs as, and whether it accepted the published Terms
type NoteWriter = { userId: string | null; isTermsCurrent: boolean }

// how a body save ends: kept at a version, or lost to a newer one
type NoteBodySaveOutcome = Extract<NoteBodySaveResult, { status: "saved" | "conflict" }>

// the category a note name violates, or null. the page or note id names a failed check
function toObjectionableNoteNameCategory(name: string, subjectId: string): Promise<ModerationCategory | null> {
	return toObjectionableCategory({ text: name, textKind: "a note's name", subjectKind: "note", subjectId })
}

/**
 * Creates a note on a topic or team page, after the Terms and the name's moderation, or returns why it did not.
 */
export async function createPageNote({
	userId,
	isTermsCurrent,
	pageKind,
	pageId,
	name,
	visibility,
}: NoteWriter & {
	pageKind: "topic" | "team"
	pageId: string
	name: string
	visibility: NoteRow["visibility"]
}): Promise<{ status: "saved"; note: Note } | NoteWriteRejection> {
	// a visitor has no page to write on, and an account behind on the Terms accepts them first
	if (!userId) {
		return { status: "notFound" }
	}
	if (!isTermsCurrent) {
		return { status: "termsOutdated" }
	}

	// an abusive name is rejected before the page loads
	const objectionableCategory = await toObjectionableNoteNameCategory(name, pageId)
	if (objectionableCategory) {
		return { status: "objectionable", category: objectionableCategory }
	}

	// create the note on its page, in a visibility the creator may use
	const page = pageKind === "topic" ? await loadTopicPage(pageId) : await loadTeamPage(pageId)
	const createdNote = page ? await createNote(userId, page, name, visibility) : null
	return createdNote ? { status: "saved", note: createdNote } : { status: "notFound" }
}

/**
 * Renames a note or changes its visibility. A rename takes edit access. A visibility change is the owner's alone and
 * stays in their creatable visibilities. A new name passes moderation, and the same name again is not classified.
 */
export async function updateNote({
	userId,
	isTermsCurrent,
	noteId,
	name,
	visibility,
}: NoteWriter & {
	noteId: string
	name?: string
	visibility?: NoteRow["visibility"]
}): Promise<{ status: "saved" } | NoteWriteRejection> {
	// the note, and the edit access a rename takes
	const visibleNote = await loadVisibleNote(userId, noteId)
	if (!visibleNote || !canEditNote(visibleNote.userId, visibleNote.note, visibleNote.access)) {
		return { status: "notFound" }
	}

	// the owner-only rules
	const isNoteOwner = visibleNote.userId !== null && visibleNote.note.ownerUserId === visibleNote.userId
	if (
		visibility &&
		(!isNoteOwner || !creatableNoteVisibilities(visibleNote.userId, visibleNote.access).includes(visibility))
	) {
		return { status: "notFound" }
	}

	// an account behind on the Terms accepts them first
	if (!isTermsCurrent) {
		return { status: "termsOutdated" }
	}

	// a new name that reads as a violation is rejected. the same name again is not classified
	const isNameChanged = name !== undefined && name !== visibleNote.note.name
	const objectionableCategory = isNameChanged ? await toObjectionableNoteNameCategory(name, visibleNote.note.id) : null
	if (objectionableCategory) {
		return { status: "objectionable", category: objectionableCategory }
	}

	// apply what was sent
	await db
		.update(notes)
		.set({ ...(name ? { name } : {}), ...(visibility ? { visibility } : {}) })
		.where(eq(notes.id, visibleNote.note.id))
	return { status: "saved" }
}

/**
 * Deletes a note with its comments and reads. Deleting is the owner's or an admin's.
 */
export async function deleteNote({
	userId,
	noteId,
}: {
	userId: string | null
	noteId: string
}): Promise<{ status: "deleted" } | { status: "notFound" }> {
	// the note, and the delete access
	const visibleNote = await loadVisibleNote(userId, noteId)
	if (!visibleNote || !canDeleteNote(visibleNote.userId, visibleNote.note, visibleNote.access)) {
		return { status: "notFound" }
	}

	// the delete takes the comments and reads with it
	await db.delete(notes).where(eq(notes.id, visibleNote.note.id))
	return { status: "deleted" }
}

/**
 * Saves a note's body at the version the editor opened at: edit access, the Terms, the sanitized body's moderation,
 * and then one conditional write. A newer stored version is a conflict that names it and who saved it.
 */
export async function saveNoteBodyEdit({
	userId,
	isTermsCurrent,
	noteId,
	html,
	version,
}: NoteWriter & {
	noteId: string
	html: string
	version: number
}): Promise<NoteBodySaveOutcome | NoteWriteRejection> {
	// writing the body takes edit access
	const visibleNote = await loadVisibleNote(userId, noteId)
	if (!visibleNote?.userId || !canEditNote(visibleNote.userId, visibleNote.note, visibleNote.access)) {
		return { status: "notFound" }
	}

	// an account behind on the Terms accepts them first
	if (!isTermsCurrent) {
		return { status: "termsOutdated" }
	}

	// a body that reads as a violation is rejected, with the markup stripped for the check. a save that changed the
	// formatting alone, or nothing, is not classified again
	const sanitizedHtml = sanitizeNoteHtml(html)
	const bodyText = toHtmlText(sanitizedHtml)
	const isTextChanged = bodyText !== toHtmlText(visibleNote.note.html)
	const objectionableCategory = isTextChanged
		? await toObjectionableCategory({
				text: bodyText,
				textKind: "a note's body",
				subjectKind: "note",
				subjectId: visibleNote.note.id,
			})
		: null
	if (objectionableCategory) {
		return { status: "objectionable", category: objectionableCategory }
	}

	// write at the version the editor opened at
	return saveNoteBody({ note: visibleNote.note, html: sanitizedHtml, version, editorUserId: visibleNote.userId })
}

// write a sanitized body at the version the editor opened at, in one conditional statement with no lock, or report
// the newer version and who saved it. a body the server already holds writes nothing and returns the stored version
async function saveNoteBody({
	note,
	html,
	version,
	editorUserId,
}: {
	note: Pick<NoteRow, "id" | "html" | "version">
	html: string
	version: number
	editorUserId: string
}): Promise<NoteBodySaveOutcome> {
	// a body equal to the stored one needs no write, whatever version the editor named
	if (html === note.html) {
		return { status: "saved", version: note.version }
	}

	// the write holds only while the stored version is the one the editor opened at
	const [savedRow] = await db
		.update(notes)
		.set({ html, version: sql`${notes.version} + 1`, lastEditorUserId: editorUserId, bodyEditedAt: new Date() })
		.where(and(eq(notes.id, note.id), eq(notes.version, version)))
		.returning({ version: notes.version })
	if (savedRow) {
		return { status: "saved", version: savedRow.version }
	}

	// the version moved. name it and who saved it, null for a closed account
	const [storedRow] = await db
		.select({ version: notes.version, lastEditorUsername: users.username })
		.from(notes)
		.leftJoin(users, eq(users.id, notes.lastEditorUserId))
		.where(eq(notes.id, note.id))
	return {
		status: "conflict",
		version: storedRow?.version ?? version,
		lastEditorUsername: storedRow?.lastEditorUsername ?? null,
	}
}

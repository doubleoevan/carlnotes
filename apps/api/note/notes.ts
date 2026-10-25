// the note routes: a page's note list, the note lifecycle, the note read with its body and version, and the body save
// at the version the editor opened at

import { NOTE_HTML_MAX_CHARS, type NoteBodySaveResult } from "@carlnotes/contracts/notes"
import { noteBodyPayload, noteCreatePayload, noteUpdatePayload } from "@carlnotes/contracts/payloads"
import { db } from "@carlnotes/db"
import { notes } from "@carlnotes/db/schema/notes"
import { users } from "@carlnotes/db/schema/users"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { and, eq, sql } from "drizzle-orm"
import { Hono } from "hono"
import { toBodyLimit, toSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { loadNoteBadges, saveNoteRead } from "./noteBadges"
import { sanitizeNoteHtml } from "./noteHtml"
import { createNote, loadNotesPayload, loadVisibleNote, toNote } from "./notePayloads"
import {
	canDeleteNote,
	canEditNote,
	creatableNoteVisibilities,
	loadTeamPage,
	loadTopicPage,
	type NoteRow,
} from "./permissions"

// the path of a note's body save, after the /api base, with a body limit of its own
export const NOTE_BODY_PATH = "/notes/:id/body"

// the body save's limit: any UTF-8 encoding of a body at the longest HTML, plus the JSON around it
const noteBodyLimit = toBodyLimit(NOTE_HTML_MAX_CHARS * 4 + 1024)

// a visitor's save responds like a missing note, before its body is read
const noteBodySignedOutRejection = toSignedOutRejection("not found", 404)

// how the api ends a save: kept at a version, or lost to a newer one
type NoteBodySaveOutcome = Extract<NoteBodySaveResult, { status: "saved" | "conflict" }>

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

// the note routes. every access rejection is a 404
export const notesRoute = new Hono<AppEnv>()
	.get("/topics/:id/notes", async (context) => {
		// the topic page's notes payload
		const page = await loadTopicPage(context.req.param("id"))
		const note = page ? await loadNotesPayload(currentUser(context), page) : null
		return note ? context.json(note) : context.json({ error: "not found" }, 404)
	})
	.get("/teams/:id/notes", async (context) => {
		// the team page's notes payload
		const page = await loadTeamPage(context.req.param("id"))
		const note = page ? await loadNotesPayload(currentUser(context), page) : null
		return note ? context.json(note) : context.json({ error: "not found" }, 404)
	})
	.post("/topics/:id/notes", zValidator("json", noteCreatePayload), async (context) => {
		// a new note on the topic
		const userId = currentUser(context)
		const { name, visibility } = context.req.valid("json")
		const page = await loadTopicPage(context.req.param("id"))
		const createdNote = page ? await createNote(userId, page, name, visibility) : null
		if (!createdNote || !userId) {
			return context.json({ error: "not found" }, 404)
		}
		trackEvent("note_created", userId, {
			...toAnalyticsProperties(context),
			pageKind: "topic",
			topicId: context.req.param("id"),
			noteVisibility: visibility,
		})
		return context.json(createdNote)
	})
	.post("/teams/:id/notes", zValidator("json", noteCreatePayload), async (context) => {
		// a new note on the team
		const userId = currentUser(context)
		const { name, visibility } = context.req.valid("json")
		const page = await loadTeamPage(context.req.param("id"))
		const createdNote = page ? await createNote(userId, page, name, visibility) : null
		if (!createdNote || !userId) {
			return context.json({ error: "not found" }, 404)
		}
		trackEvent("note_created", userId, {
			...toAnalyticsProperties(context),
			pageKind: "team",
			teamId: context.req.param("id"),
			noteVisibility: visibility,
		})
		return context.json(createdNote)
	})
	.get("/note-badges", async (context) => {
		// every unread count the signed-in user has. a visitor is given none
		return context.json({ badges: await loadNoteBadges(currentUser(context)) })
	})
	.post("/notes/:id/read", async (context) => {
		// opening a note clears both of its counts. marking it read takes the same access reading it does
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		if (!visibleNote?.userId) {
			return context.json({ error: "not found" }, 404)
		}
		await saveNoteRead(visibleNote.userId, visibleNote.note.id)
		return context.json({ ok: true })
	})
	.get("/notes/:id", async (context) => {
		// one note for its dialog, with the stored body and the version the next save names
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		if (!visibleNote) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json({
			...toNote(visibleNote.note, visibleNote.userId, visibleNote.access),
			html: visibleNote.note.html,
			version: visibleNote.note.version,
		})
	})
	.patch("/notes/:id", zValidator("json", noteUpdatePayload), async (context) => {
		// a rename takes edit access. a visibility change is the owner's alone and stays in their creatable visibilities
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		const { name, visibility } = context.req.valid("json")
		if (!visibleNote || !canEditNote(visibleNote.userId, visibleNote.note, visibleNote.access)) {
			return context.json({ error: "not found" }, 404)
		}

		// the owner-only rules
		const isNoteOwner = visibleNote.userId !== null && visibleNote.note.ownerUserId === visibleNote.userId
		if (
			visibility &&
			(!isNoteOwner || !creatableNoteVisibilities(visibleNote.userId, visibleNote.access).includes(visibility))
		) {
			return context.json({ error: "not found" }, 404)
		}

		// apply what was sent
		await db
			.update(notes)
			.set({ ...(name ? { name } : {}), ...(visibility ? { visibility } : {}) })
			.where(eq(notes.id, visibleNote.note.id))
		return context.json({ ok: true })
	})
	.delete("/notes/:id", async (context) => {
		// deleting is the owner's or an admin's, and takes the comments and reads with it
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		if (!visibleNote || !canDeleteNote(visibleNote.userId, visibleNote.note, visibleNote.access)) {
			return context.json({ error: "not found" }, 404)
		}
		await db.delete(notes).where(eq(notes.id, visibleNote.note.id))
		return context.json({ ok: true })
	})
	.put(
		NOTE_BODY_PATH,
		noteBodySignedOutRejection,
		noteBodyLimit,
		zValidator("json", noteBodyPayload),
		async (context) => {
			// writing the body takes edit access
			const visibleNote = await loadVisibleNote(context, context.req.param("id"))
			if (!visibleNote?.userId || !canEditNote(visibleNote.userId, visibleNote.note, visibleNote.access)) {
				return context.json({ error: "not found" }, 404)
			}

			// sanitize, then write at the version the editor opened at. a newer version is a conflict
			const { html, version } = context.req.valid("json")
			const saveOutcome = await saveNoteBody({
				note: visibleNote.note,
				html: sanitizeNoteHtml(html),
				version,
				editorUserId: visibleNote.userId,
			})
			if (saveOutcome.status === "conflict") {
				return context.json(
					{ error: "conflict", version: saveOutcome.version, lastEditorUsername: saveOutcome.lastEditorUsername },
					409,
				)
			}
			return context.json({ version: saveOutcome.version })
		},
	)

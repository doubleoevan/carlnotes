// the note routes: a page's note list, the note lifecycle, the ydoc snapshot and update sync, and the live stream
import { zValidator } from "@hono/zod-validator"
import type { Note, NotesResponse } from "@shared/contracts"
import { noteCreatePayload, noteSyncPayload, noteUpdatePayload } from "@shared/contracts"
import { and, eq, inArray, ne, or, sql } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { streamSSE } from "hono/streaming"
import sanitizeHtml from "sanitize-html"
import * as Y from "yjs"
import { z } from "zod"
import { db } from "../../db"
import { notes, teamMembers, teamTopics, users } from "../../db/schema"
import { type AppEnv, currentUser } from "../currentUser"
import { isNoteBodyChanged, loadNoteBadges, saveNoteRead } from "./noteBadges"
import { notifyNoteUpdate, onNoteUpdate } from "./noteStream"
import {
	canDeleteNote,
	canEditNote,
	canSeeNote,
	creatableNoteVisibilities,
	loadNoteWithPage,
	loadPageAccess,
	loadTeamPage,
	loadTopicPage,
	type NotePage,
	type PageAccess,
} from "./permissions"

type NoteRow = typeof notes.$inferSelect

// a live stream ends at this age
const NOTE_STREAM_MAX_AGE_MS = 15 * 60 * 1000

// the comma-joined user ids to resolve into usernames and avatars
const noteUsersQuery = z.object({ ids: z.string().optional() })

// how long after the last merge the HTML regenerates
const NOTE_HTML_DEBOUNCE_MS = 1500

/**
 * Merge one incoming yjs update into the stored document bytes.
 */
export function mergeNoteYdoc(ydoc: Uint8Array, update: Uint8Array): Uint8Array {
	return Y.mergeUpdates([ydoc, update])
}

/**
 * The stored document as a yjs update, diffed down to what a client's state vector is missing.
 */
export function toNoteSnapshot(ydoc: Uint8Array, stateVector: Uint8Array | null): Uint8Array {
	return stateVector ? Y.diffUpdate(ydoc, stateVector) : ydoc
}

/**
 * The document bytes of a brand-new empty note.
 */
export function emptyNoteYdoc(): Uint8Array {
	return Y.encodeStateAsUpdate(new Y.Doc())
}

/**
 * Merge an update into a note under its advisory lock, persist it, and fan it out to subscribers.
 */
async function saveNoteUpdate(noteId: string, update: Uint8Array, editorUserId: string): Promise<void> {
	// the merge runs under a per-note advisory lock
	await db.transaction(async (transaction) => {
		await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`note:${noteId}`}, 0))`)

		// read the one document blob
		const [note] = await transaction.select({ ydoc: notes.ydoc }).from(notes).where(eq(notes.id, noteId))
		if (!note) {
			return
		}

		// merge and write it back, recording who wrote it
		const merged = mergeNoteYdoc(note.ydoc, update)
		await transaction.update(notes).set({ ydoc: merged, lastEditorUserId: editorUserId }).where(eq(notes.id, noteId))
	})

	// subscribers get the raw update, and the HTML refreshes after the burst settles
	await notifyNoteUpdate(noteId, Buffer.from(update).toString("base64"))
	scheduleNoteHtml(noteId)
}

// the pending HTML regeneration timers, one per note
const htmlTimers = new Map<string, ReturnType<typeof setTimeout>>()

// refresh a note's HTML after the merge burst settles
function scheduleNoteHtml(noteId: string): void {
	// a fresh merge restarts the debounce
	clearTimeout(htmlTimers.get(noteId))
	const timer = setTimeout(() => {
		htmlTimers.delete(noteId)
		regenerateNoteHtml(noteId).catch((error) => console.error("note html regeneration failed", error))
	}, NOTE_HTML_DEBOUNCE_MS)

	// keep the timer for the next merge. an unreferenced one does not hold the process open
	timer.unref?.()
	htmlTimers.set(noteId, timer)
}

/**
 * Regenerate the stored HTML from the note's ydoc.
 */
async function regenerateNoteHtml(noteId: string): Promise<void> {
	// the current document bytes beside the HTML they last produced
	const [note] = await db.select({ ydoc: notes.ydoc, html: notes.html }).from(notes).where(eq(notes.id, noteId))
	if (!note) {
		return
	}

	// a body edit is dated here, where the content has settled. a comment only adds a mark and leaves the date alone
	const html = await toNoteHtml(note.ydoc)
	const bodyEditedAt = isNoteBodyChanged(note.html, html) ? new Date() : undefined
	await db.update(notes).set({ html, bodyEditedAt }).where(eq(notes.id, noteId))
}

/**
 * Render a note ydoc's blocks to sanitized HTML.
 */
export async function toNoteHtml(ydoc: Uint8Array): Promise<string> {
	// hydrate a doc and serialize its blocks
	const document = new Y.Doc()
	Y.applyUpdate(document, ydoc)
	const serverEditor = await loadServerEditor()
	const blocks = serverEditor.yDocToBlocks(document)
	return sanitizeNoteHtml(await serverEditor.blocksToFullHTML(blocks))
}

/**
 * Strip anything but the markup the editor's serializer produces.
 */
export function sanitizeNoteHtml(html: string): string {
	return sanitizeHtml(html, {
		// the block wrappers, inline marks, list shapes, tables, and checklist checkboxes the serializer produces
		allowedTags: [...sanitizeHtml.defaults.allowedTags, "div", "span", "section", "input", "label", "img"],
		allowedAttributes: {
			"*": ["class", "data-*", "id"],
			a: ["href", "target", "rel", "class", "data-*"],
			img: ["src", "alt", "width", "class", "data-*"],
			input: ["type", "checked", "disabled", "class", "data-*"],
		},
		// links and images stay on the web's schemes
		allowedSchemes: ["http", "https", "mailto"],
	})
}

// the one server-side editor, created lazily. the import pulls in JSDOM
let serverEditorPromise: Promise<import("@blocknote/server-util").ServerBlockNoteEditor> | null = null
function loadServerEditor(): Promise<import("@blocknote/server-util").ServerBlockNoteEditor> {
	serverEditorPromise ??= import("@blocknote/server-util").then(({ ServerBlockNoteEditor }) =>
		ServerBlockNoteEditor.create(),
	)
	return serverEditorPromise
}

// the visible note with its page
async function loadVisibleNote(
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

// one note row shaped for the api
function toNote(note: NoteRow, userId: string | null, access: PageAccess): Note {
	return {
		id: note.id,
		name: note.name,
		visibility: note.visibility,
		createdAt: note.createdAt.toISOString(),
		updatedAt: note.updatedAt.toISOString(),
		canEdit: canEditNote(userId, note, access),
		isOwner: userId !== null && note.ownerUserId === userId,
		canDelete: canDeleteNote(userId, note, access),
	}
}

// the notes payload for a page. the visible notes come newest first
async function loadNotesPayload(userId: string | null, page: NotePage): Promise<NotesResponse | null> {
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

// create one note on a page, rejected outside the creator's creatable visibilities
async function createNote(
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

// the SSE stream for one note. an update event sends the bytes, a resync event asks the client to resync
function streamNoteEvents(context: Context, noteId: string): Response {
	return streamSSE(context, async (stream) => {
		// the heartbeat keeps the stream detectably alive. a dead socket behind a proxy stays silent
		const heartbeat = setInterval(
			() =>
				void stream
					.writeSSE({ event: "ping", data: "" })
					.catch((error) => console.error("note stream heartbeat failed", error)),
			25_000,
		)

		// hold the connection until the client leaves or the age limit closes it
		await new Promise<void>((resolve) => {
			const stopListening = onNoteUpdate(noteId, (update) => {
				const event = update ? { event: "update", data: update } : { event: "resync", data: "" }
				void stream.writeSSE(event).catch((error) => console.error("note stream write failed", error))
			})

			// one teardown for both endings
			const endStream = (): void => {
				clearInterval(heartbeat)
				clearTimeout(maxAge)
				stopListening()
				resolve()
			}

			// the age limit closes the socket. the client reconnects with a state-vector resync
			const maxAge = setTimeout(() => {
				endStream()
				void stream.close()
			}, NOTE_STREAM_MAX_AGE_MS)
			stream.onAbort(endStream)
		})
	})
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
		const { name, visibility } = context.req.valid("json")
		const page = await loadTopicPage(context.req.param("id"))
		const createdNote = page ? await createNote(currentUser(context), page, name, visibility) : null
		return createdNote ? context.json(createdNote) : context.json({ error: "not found" }, 404)
	})
	.post("/teams/:id/notes", zValidator("json", noteCreatePayload), async (context) => {
		// a new note on the team
		const { name, visibility } = context.req.valid("json")
		const page = await loadTeamPage(context.req.param("id"))
		const createdNote = page ? await createNote(currentUser(context), page, name, visibility) : null
		return createdNote ? context.json(createdNote) : context.json({ error: "not found" }, 404)
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
		// one note for its dialog, with the stored HTML
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		if (!visibleNote) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json({
			...toNote(visibleNote.note, visibleNote.userId, visibleNote.access),
			html: visibleNote.note.html,
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
		const isOwner = visibleNote.userId !== null && visibleNote.note.ownerUserId === visibleNote.userId
		if (
			visibility &&
			(!isOwner || !creatableNoteVisibilities(visibleNote.userId, visibleNote.access).includes(visibility))
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
		// deleting is the owner's or an admin's, and takes the threads and comments with it
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		if (!visibleNote || !canDeleteNote(visibleNote.userId, visibleNote.note, visibleNote.access)) {
			return context.json({ error: "not found" }, 404)
		}
		await db.delete(notes).where(eq(notes.id, visibleNote.note.id))
		return context.json({ ok: true })
	})
	.get("/notes/:id/ydoc", async (context) => {
		// the document snapshot, diffed against the client's state vector when one is sent
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		if (!visibleNote) {
			return context.json({ error: "not found" }, 404)
		}

		// base64 decoding drops invalid characters instead of throwing, so a garbage vector decodes to noise
		const stateVectorQuery = context.req.query("sv")
		const stateVector = stateVectorQuery ? Buffer.from(stateVectorQuery, "base64") : null

		// the snapshot goes back as raw yjs update bytes. a garbage state vector falls back to the full document
		let snapshot: Uint8Array
		try {
			snapshot = toNoteSnapshot(visibleNote.note.ydoc, stateVector)
		} catch {
			snapshot = visibleNote.note.ydoc
		}
		return context.body(Buffer.from(snapshot) as unknown as ArrayBuffer, 200, {
			"Content-Type": "application/octet-stream",
			"Cache-Control": "no-store",
		})
	})
	.post("/notes/:id/updates", zValidator("json", noteSyncPayload), async (context) => {
		// one base64 update in, merged under the note's lock. writing takes edit access
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		if (!visibleNote?.userId || !canEditNote(visibleNote.userId, visibleNote.note, visibleNote.access)) {
			return context.json({ error: "not found" }, 404)
		}

		// reject bytes that do not decode as a yjs update
		try {
			const update = Buffer.from(context.req.valid("json").update, "base64")
			Y.encodeStateVectorFromUpdate(update)
			await saveNoteUpdate(visibleNote.note.id, update, visibleNote.userId)
		} catch {
			return context.json({ error: "invalid update" }, 400)
		}

		return context.json({ ok: true })
	})
	.get("/notes/:id/events", async (context) => {
		// the live stream, view access only
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		if (!visibleNote) {
			return context.json({ error: "not found" }, 404)
		}

		// the stream owns the connection from here
		return streamNoteEvents(context, visibleNote.note.id)
	})
	.get("/notes/:id/users", zValidator("query", noteUsersQuery), async (context) => {
		// the comment authors' usernames and avatars, resolved for anyone who may read the note
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		if (!visibleNote) {
			return context.json({ error: "not found" }, 404)
		}

		// look up the requested ids, at most fifty
		const userIds = (context.req.valid("query").ids ?? "").split(",").filter(Boolean).slice(0, 50)
		const userRows = userIds.length
			? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, userIds))
			: []
		return context.json({
			users: userRows.map((userRow) => ({
				id: userRow.id,
				username: userRow.username,
				avatarUrl: `/api/avatars/${userRow.id}`,
			})),
		})
	})

// the note routes: a page's note list, the note lifecycle, the ydoc snapshot and update sync, and the live stream
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import { toAvatarVersion } from "@shared/avatars"
import { NOTE_UPDATE_MAX_CHARS } from "@shared/contracts"
import { noteCreatePayload, noteSyncPayload, noteUpdatePayload } from "@shared/payloads"
import { eq, inArray } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { streamSSE } from "hono/streaming"
import * as Y from "yjs"
import { z } from "zod"
import { db } from "../../db"
import { notes } from "../../db/schema/notes"
import { users } from "../../db/schema/users"
import { toBodyLimit, toSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { loadNoteBadges, saveNoteRead } from "./noteBadges"
import { createNote, loadNotesPayload, loadVisibleNote, toNote } from "./notePayloads"
import { onNoteUpdate } from "./noteStream"
import { saveNoteUpdate, toNoteSnapshot } from "./noteYdoc"
import { canDeleteNote, canEditNote, creatableNoteVisibilities, loadTeamPage, loadTopicPage } from "./permissions"

// a live stream ends at this age
const NOTE_STREAM_MAX_AGE_MS = 15 * 60 * 1000

// the note sync post's body limit: one update at its largest, plus the JSON around it
const noteSyncBodyLimit = toBodyLimit(NOTE_UPDATE_MAX_CHARS + 1024)

// a visitor's note sync post responds like a missing note, before its body is read
const noteSyncSignedOutRejection = toSignedOutRejection("not found", 404)

// the comma-joined user ids to resolve into usernames and avatars
const noteUsersQuery = z.object({ ids: z.string().optional() })

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
		const isTopicOwner = visibleNote.userId !== null && visibleNote.note.ownerUserId === visibleNote.userId
		if (
			visibility &&
			(!isTopicOwner || !creatableNoteVisibilities(visibleNote.userId, visibleNote.access).includes(visibility))
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
	.post(
		"/notes/:id/updates",
		noteSyncSignedOutRejection,
		noteSyncBodyLimit,
		zValidator("json", noteSyncPayload),
		async (context) => {
			// one base64 update in, merged under the note's lock. writing takes edit access
			const visibleNote = await loadVisibleNote(context, context.req.param("id"))
			if (!visibleNote?.userId || !canEditNote(visibleNote.userId, visibleNote.note, visibleNote.access)) {
				return context.json({ error: "not found" }, 404)
			}

			// reject bytes that do not decode as a yjs update
			let update: Buffer
			try {
				update = Buffer.from(context.req.valid("json").update, "base64")
				Y.encodeStateVectorFromUpdate(update)
			} catch {
				return context.json({ error: "invalid update" }, 400)
			}

			// a failed save answers 500 instead of the invalid-update 400
			await saveNoteUpdate(visibleNote.note.id, update, visibleNote.userId)
			return context.json({ ok: true })
		},
	)
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
			? await db
					.select({
						id: users.id,
						username: users.username,
						avatarSource: users.avatarSource,
						avatarKey: users.avatarKey,
					})
					.from(users)
					.where(inArray(users.id, userIds))
			: []

		// return each comment author with an avatar url that names its version
		return context.json({
			users: userRows.map((userRow) => ({
				id: userRow.id,
				username: userRow.username,
				avatarUrl: `/api/avatars/${userRow.id}?v=${toAvatarVersion(userRow) ?? ""}`,
			})),
		})
	})

// the note routes: a page's note list, the note lifecycle, the note read with its body and version, and the body save
// at the version the editor opened at

import { NOTE_HTML_MAX_CHARS } from "@carlnotes/contracts/notes"
import {
	type NoteCreatePayload,
	noteBodyPayload,
	noteCreatePayload,
	noteUpdatePayload,
} from "@carlnotes/contracts/payloads"
import { loadNoteBadges, saveNoteRead } from "@carlnotes/db/noteBadges"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { type Context, Hono } from "hono"
import { toBodyLimit, toSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toObjectionableContentResponse } from "../moderation"
import { noteBodySaveRateLimiter, toolCallerRateLimiter } from "../rateLimit"
import { isSessionTermsCurrent, toTermsOutdatedRejection } from "../termsAcceptance"
import { loadNotesPayload, loadVisibleNote, toNoteResponse } from "./notePayloads"
import { createPageNote, deleteNote, type NoteWriteRejection, saveNoteBodyEdit, updateNote } from "./noteWrites"
import { loadTeamPage, loadTopicPage } from "./permissions"

// the path of a note's body save, after the /api base, with a body limit of its own
export const NOTE_BODY_PATH = "/notes/:id/body"

// the body save's limit: any UTF-8 encoding of a body at the longest HTML, plus the JSON around it
const noteBodyLimit = toBodyLimit(NOTE_HTML_MAX_CHARS * 4 + 1024)

// a visitor's save responds like a missing note, before its body is read
const noteBodySignedOutRejection = toSignedOutRejection("not found", 404)

// the response a note write's rejection gets: a 404 for any access rejection, the Terms 403, or the moderation 422
function toNoteWriteRejectionResponse(context: Context<AppEnv>, rejection: NoteWriteRejection): Response {
	switch (rejection.status) {
		case "notFound":
			return context.json({ error: "not found" }, 404)
		// the Terms and moderation rejections say what the user can do
		case "termsOutdated":
			return toTermsOutdatedRejection(context)
		case "objectionable":
			return toObjectionableContentResponse(context, rejection.category)
	}
}

// a new note on a topic or team page, by a signed-in user who accepted the current Terms, tracked with its page
async function toCreatedNoteResponse(
	context: Context<AppEnv>,
	pageKind: "topic" | "team",
	{ name, visibility }: NoteCreatePayload,
): Promise<Response> {
	// a visitor has no page to write on
	const userId = currentUser(context)
	if (!userId) {
		return context.json({ error: "not found" }, 404)
	}

	// the create, with the Terms and the name's moderation
	const pageId = context.req.param("id") ?? ""
	const createPageNoteResult = await createPageNote({
		userId,
		isTermsCurrent: isSessionTermsCurrent(context),
		pageKind,
		pageId,
		name,
		visibility,
	})
	if (createPageNoteResult.status !== "saved") {
		return toNoteWriteRejectionResponse(context, createPageNoteResult)
	}

	// the event names the page
	trackEvent("note_created", userId, {
		...toAnalyticsProperties(context),
		pageKind,
		...(pageKind === "topic" ? { topicId: pageId } : { teamId: pageId }),
		noteVisibility: visibility,
	})
	return context.json(createPageNoteResult.note)
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
	.post("/topics/:id/notes", toolCallerRateLimiter, zValidator("json", noteCreatePayload), (context) =>
		toCreatedNoteResponse(context, "topic", context.req.valid("json")),
	)
	.post("/teams/:id/notes", toolCallerRateLimiter, zValidator("json", noteCreatePayload), (context) =>
		toCreatedNoteResponse(context, "team", context.req.valid("json")),
	)
	.get("/note-badges", async (context) => {
		// every unread count the signed-in user has. a visitor is given none
		return context.json({ badges: await loadNoteBadges(currentUser(context)) })
	})
	.post("/notes/:id/read", async (context) => {
		// opening a note clears both of its counts. marking it read takes the same access reading it does
		const visibleNote = await loadVisibleNote(currentUser(context), context.req.param("id"))
		if (!visibleNote?.userId) {
			return context.json({ error: "not found" }, 404)
		}
		await saveNoteRead(visibleNote.userId, visibleNote.note.id)
		return context.json({ ok: true })
	})
	.get("/notes/:id", async (context) => {
		// one note for its dialog, with the stored body and the version the next save names
		const visibleNote = await loadVisibleNote(currentUser(context), context.req.param("id"))
		return visibleNote ? context.json(await toNoteResponse(visibleNote)) : context.json({ error: "not found" }, 404)
	})
	.patch("/notes/:id", toolCallerRateLimiter, zValidator("json", noteUpdatePayload), async (context) => {
		// a rename takes edit access. a visibility change is the owner's alone and stays in their creatable visibilities
		const updateNoteResult = await updateNote({
			userId: currentUser(context),
			isTermsCurrent: isSessionTermsCurrent(context),
			noteId: context.req.param("id"),
			...context.req.valid("json"),
		})
		return updateNoteResult.status === "saved"
			? context.json({ ok: true })
			: toNoteWriteRejectionResponse(context, updateNoteResult)
	})
	.delete("/notes/:id", async (context) => {
		// deleting is the owner's or an admin's, and takes the comments and reads with it
		const deleteNoteResult = await deleteNote({ userId: currentUser(context), noteId: context.req.param("id") })
		return deleteNoteResult.status === "deleted"
			? context.json({ ok: true })
			: toNoteWriteRejectionResponse(context, deleteNoteResult)
	})
	.put(
		NOTE_BODY_PATH,
		noteBodySaveRateLimiter,
		noteBodySignedOutRejection,
		noteBodyLimit,
		zValidator("json", noteBodyPayload),
		async (context) => {
			// write at the version the editor opened at, after edit access, the Terms, and the body's moderation
			const saveNoteBodyEditResult = await saveNoteBodyEdit({
				userId: currentUser(context),
				isTermsCurrent: isSessionTermsCurrent(context),
				noteId: context.req.param("id"),
				...context.req.valid("json"),
			})

			// the saved version, the conflict, or the rejection
			switch (saveNoteBodyEditResult.status) {
				case "saved":
					return context.json({ version: saveNoteBodyEditResult.version })
				// a conflict names the stored version and who saved it
				case "conflict":
					return context.json(
						{
							error: "conflict",
							version: saveNoteBodyEditResult.version,
							lastEditorUsername: saveNoteBodyEditResult.lastEditorUsername,
						},
						409,
					)
				// every other rejection
				default:
					return toNoteWriteRejectionResponse(context, saveNoteBodyEditResult)
			}
		},
	)

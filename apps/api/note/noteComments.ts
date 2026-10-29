// the note comment routes: the thread, oldest first, a post behind edit access, and the author's own delete
import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import type { NoteComment } from "@carlnotes/contracts/notes"
import { noteCommentPayload } from "@carlnotes/contracts/payloads"
import { db } from "@carlnotes/db"
import { noteComments } from "@carlnotes/db/schema/notes"
import { users } from "@carlnotes/db/schema/users"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { and, asc, eq } from "drizzle-orm"
import { Hono } from "hono"
import { type AppEnv, toAnalyticsProperties } from "../currentUser"
import { toObjectionableCategory, toObjectionableTextResponse } from "../moderation"
import { toolCallerRateLimiter } from "../rateLimit"
import { toUnreportedFilter } from "../report/reports"
import { toTermsOutdatedResponse } from "../termsAcceptance"
import { toUnblockedAuthorFilter } from "../userBlocks"
import { loadVisibleNote } from "./notePayloads"
import { canEditNote } from "./permissions"

// a comment row with its author's name and avatar, null for a closed account
type NoteCommentRow = {
	id: string
	body: string
	createdAt: Date
	authorUserId: string | null
	// the author's name and avatar, from the user row joined to the comment
	username: string | null
	avatarSource: string | null
	avatarKey: string | null
}

// the fields the thread reads, from the comment row and the author joined to it
const noteCommentColumns = {
	id: noteComments.id,
	body: noteComments.body,
	createdAt: noteComments.createdAt,
	authorUserId: noteComments.authorUserId,
	username: users.username,
	avatarSource: users.avatarSource,
	avatarKey: users.avatarKey,
}

// the comment's own columns, which a post takes back from its insert
const insertedNoteCommentColumns = {
	id: noteComments.id,
	body: noteComments.body,
	createdAt: noteComments.createdAt,
	authorUserId: noteComments.authorUserId,
}

// one comment as the thread renders it. the user may delete their own
function toNoteComment(noteCommentRow: NoteCommentRow, userId: string | null): NoteComment {
	// the author's profile identity, or null once the account closed
	const author =
		noteCommentRow.authorUserId && noteCommentRow.username
			? {
					userId: noteCommentRow.authorUserId,
					username: noteCommentRow.username,
					avatarSource: noteCommentRow.avatarSource,
					avatarVersion: toAvatarVersion(noteCommentRow),
				}
			: null
	return {
		id: noteCommentRow.id,
		body: noteCommentRow.body,
		createdAt: noteCommentRow.createdAt.toISOString(),
		author,
		canDelete: userId !== null && noteCommentRow.authorUserId === userId,
	}
}

// the note's thread, oldest first, with each author joined. a signed-in user's thread leaves out the comments they
// reported and the ones by people they blocked
async function loadNoteComments(noteId: string, userId: string | null): Promise<NoteComment[]> {
	const hiddenCommentFilter = userId
		? and(
				toUnreportedFilter(userId, "noteComment", noteComments.id),
				toUnblockedAuthorFilter(userId, noteComments.authorUserId),
			)
		: undefined
	const noteCommentRows = await db
		.select(noteCommentColumns)
		.from(noteComments)
		.leftJoin(users, eq(users.id, noteComments.authorUserId))
		.where(and(eq(noteComments.noteId, noteId), hiddenCommentFilter))
		.orderBy(asc(noteComments.createdAt))

	// each row shaped for the thread
	return noteCommentRows.map((noteCommentRow) => toNoteComment(noteCommentRow, userId))
}

// which comment to delete, on which note, and by which author. a null author is an admin's delete of anyone's comment
type DeleteNoteCommentOptions = { noteCommentId: string; noteId: string; authorUserId: string | null }

/**
 * Deletes one comment on a note, the author's own or any for an admin. Returns the deleted rows, empty if none matched.
 */
export async function deleteNoteComment({
	noteCommentId,
	noteId,
	authorUserId,
}: DeleteNoteCommentOptions): Promise<{ id: string }[]> {
	return db
		.delete(noteComments)
		.where(
			and(
				eq(noteComments.id, noteCommentId),
				eq(noteComments.noteId, noteId),
				authorUserId === null ? undefined : eq(noteComments.authorUserId, authorUserId),
			),
		)
		.returning({ id: noteComments.id })
}

// the note comment routes. every access rejection is a 404, like the note routes
export const noteCommentsRoute = new Hono<AppEnv>()
	.get("/notes/:id/comments", async (context) => {
		// the thread, for anyone who may read the note
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		if (!visibleNote) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json({ comments: await loadNoteComments(visibleNote.note.id, visibleNote.userId) })
	})
	.post("/notes/:id/comments", toolCallerRateLimiter, zValidator("json", noteCommentPayload), async (context) => {
		// a post takes edit access, the same gate as writing the body
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		const sessionUser = context.get("user")

		// a visitor, an unreadable note, and a user without edit access all see a missing note
		if (
			!visibleNote?.userId ||
			!sessionUser ||
			!canEditNote(visibleNote.userId, visibleNote.note, visibleNote.access)
		) {
			return context.json({ error: "not found" }, 404)
		}

		// a user who has not accepted the current Terms is asked to first
		const termsOutdatedResponse = toTermsOutdatedResponse(context)
		if (termsOutdatedResponse) {
			return termsOutdatedResponse
		}

		// a comment that reads as a violation is rejected in Carl's words before it is stored
		const { body } = context.req.valid("json")
		const objectionableCategory = await toObjectionableCategory({
			text: body,
			textKind: "a comment on a note",
			subjectKind: "noteComment",
			subjectId: visibleNote.note.id,
		})
		if (objectionableCategory) {
			return toObjectionableTextResponse(context, objectionableCategory)
		}

		// write the comment, and take the row back as the thread reads it
		const [insertedRow] = await db
			.insert(noteComments)
			.values({ noteId: visibleNote.note.id, authorUserId: visibleNote.userId, body })
			.returning(insertedNoteCommentColumns)

		// no row back means the note went between the access check and the write
		if (!insertedRow) {
			return context.json({ error: "not found" }, 404)
		}

		// the thread's one event, named after the note
		trackEvent("note_comment_added", visibleNote.userId, {
			...toAnalyticsProperties(context),
			noteId: visibleNote.note.id,
		})

		// the author is the session user, so the comment needs no read back
		const noteCommentRow: NoteCommentRow = {
			...insertedRow,
			username: sessionUser.username,
			avatarSource: sessionUser.avatarSource ?? null,
			avatarKey: sessionUser.avatarKey ?? null,
		}
		return context.json(toNoteComment(noteCommentRow, visibleNote.userId))
	})
	.delete("/notes/:id/comments/:commentId", async (context) => {
		// a delete is the author's or an admin's, on a note they may read
		const visibleNote = await loadVisibleNote(context, context.req.param("id"))
		if (!visibleNote?.userId) {
			return context.json({ error: "not found" }, 404)
		}

		// the delete names the note and, for anyone but an admin, the author, so another user's comment id changes
		// nothing
		const deletedRows = await deleteNoteComment({
			noteCommentId: context.req.param("commentId"),
			noteId: visibleNote.note.id,
			authorUserId: visibleNote.access.isAdmin ? null : visibleNote.userId,
		})

		// no row means somebody else's comment, or one already gone
		if (deletedRows.length === 0) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json({ ok: true })
	})

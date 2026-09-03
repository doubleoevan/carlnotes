// the note comment routes: the thread and comment writes the editor's REST thread store sends.
// each write checks edit access, mutates the ydoc threads map under the note's lock, mirrors sql, and fans out
import { DefaultThreadStoreAuth } from "@blocknote/core/comments"
import { YjsThreadStore } from "@blocknote/core/yjs"
import { and, eq, inArray, not, sql } from "drizzle-orm"
import { type Context, Hono } from "hono"
import * as Y from "yjs"
import { db } from "../../db"
import { noteComments, noteCommentThreads, notes } from "../../db/schema"
import { type AppEnv, currentUser } from "../currentUser"
import { notifyNoteUpdate } from "./noteStream"
import { canEditNote, loadNoteWithPage, loadPageAccess } from "./permissions"

// a transaction handle, so the mirror writes share the caller's locked transaction
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// one thread as the ydoc stores it, read back for mirroring
type StoredThread = {
	id: string
	resolved?: boolean
	comments?: { id: string; userId?: string; body?: unknown; deletedAt?: number }[]
}

// the note id when the user may write its comments, or null. commenting takes edit access
async function loadCommentableNoteId(context: Context, noteId: string): Promise<string | null> {
	// the row, its page, and the write gate
	const userId = currentUser(context)
	const noteWithPage = await loadNoteWithPage(noteId)
	if (!userId || !noteWithPage) {
		return null
	}
	const pageAccess = await loadPageAccess(userId, noteWithPage.page)
	return canEditNote(userId, noteWithPage.note, pageAccess) ? noteWithPage.note.id : null
}

// run one thread-store mutation on the note's ydoc under its advisory lock, then mirror and fan out
async function mutateNoteThreads<Result>(
	noteId: string,
	userId: string,
	threadId: string | null,
	mutate: (threadStore: YjsThreadStore) => Promise<Result>,
): Promise<{ result: Result } | null> {
	// the produced yjs updates, captured for the fan-out
	const producedUpdates: Uint8Array[] = []

	// the mutation and the persist share the transaction that holds the lock
	const outcome = await db.transaction(async (transaction) => {
		await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`note:${noteId}`}, 0))`)

		// hydrate the doc and record what the mutation changes
		const [note] = await transaction.select({ ydoc: notes.ydoc }).from(notes).where(eq(notes.id, noteId))
		if (!note) {
			return null
		}
		const document = new Y.Doc()
		Y.applyUpdate(document, note.ydoc)
		document.on("update", (update: Uint8Array) => producedUpdates.push(update))

		// the store enforces per-comment ownership
		const threadStore = new YjsThreadStore(
			userId,
			document.getMap("threads"),
			new DefaultThreadStoreAuth(userId, "editor"),
		)
		const result = await mutate(threadStore)

		// persist the whole merged document
		await transaction
			.update(notes)
			.set({ ydoc: Y.encodeStateAsUpdate(document) })
			.where(eq(notes.id, noteId))

		// mirror the touched thread on the same transaction, so the mirror shares the lock and commits atomically
		const touchedThreadId = threadId ?? (result as { id?: string })?.id ?? null
		if (touchedThreadId) {
			await mirrorNoteThread(transaction, noteId, touchedThreadId, document)
		}
		return { result }
	})

	// subscribers converge on the same threads map through the normal update event
	if (outcome && producedUpdates.length > 0) {
		await notifyNoteUpdate(noteId, Buffer.from(Y.mergeUpdates(producedUpdates)).toString("base64"))
	}
	return outcome
}

// sync the sql mirror of one thread to what the ydoc now holds, on the caller's locked transaction
async function mirrorNoteThread(
	transaction: DbTransaction,
	noteId: string,
	threadId: string,
	document: Y.Doc,
): Promise<void> {
	// a thread gone from the map deletes its mirror rows through the cascade
	const storedThread = document.getMap("threads").get(threadId) as { toJSON(): StoredThread } | undefined
	if (!storedThread) {
		await transaction.delete(noteCommentThreads).where(eq(noteCommentThreads.id, threadId))
		return
	}

	// upsert the thread row
	const thread = storedThread.toJSON()
	await transaction
		.insert(noteCommentThreads)
		.values({ id: threadId, noteId, isResolved: thread.resolved ?? false })
		.onConflictDoUpdate({ target: noteCommentThreads.id, set: { isResolved: thread.resolved ?? false } })

	// upsert every comment the thread holds in one write, so a busy thread never serializes round-trips under the lock
	const comments = thread.comments ?? []
	if (comments.length > 0) {
		await transaction
			.insert(noteComments)
			.values(
				comments.map((comment) => ({
					id: comment.id,
					threadId,
					authorUserId: comment.userId ?? null,
					body: comment.body ?? null,
					deletedAt: comment.deletedAt ? new Date(comment.deletedAt) : null,
				})),
			)
			.onConflictDoUpdate({
				target: noteComments.id,
				set: { body: sql`excluded.body`, deletedAt: sql`excluded.deleted_at` },
			})
	}
	// drop mirror rows for comments the ydoc no longer holds
	const commentIds = comments.map((comment) => comment.id)
	await transaction
		.delete(noteComments)
		.where(
			commentIds.length > 0
				? and(eq(noteComments.threadId, threadId), not(inArray(noteComments.id, commentIds)))
				: eq(noteComments.threadId, threadId),
		)
}

// the store throws "Not authorized" for a write the per-comment rules rejection, which maps to a 403
function toThreadErrorResponse(context: Context, error: unknown): Response {
	const message = error instanceof Error ? error.message : "comment write failed"
	return context.json({ error: message }, message === "Not authorized" ? 403 : 400)
}

// the note comment routes, shaped to the editor's REST thread store calls
export const noteCommentThreadsRoute = new Hono<AppEnv>()
	.post("/notes/:id/threads", async (context) => {
		// a new thread with its first comment
		const userId = currentUser(context)
		const noteId = userId ? await loadCommentableNoteId(context, context.req.param("id")) : null
		if (!userId || !noteId) {
			return context.json({ error: "not found" }, 404)
		}

		// the store generates the thread and comment ids
		const body = await context.req.json()
		try {
			const outcome = await mutateNoteThreads(noteId, userId, null, (threadStore) =>
				threadStore.createThread({ initialComment: body?.initialComment ?? { body: undefined } }),
			)
			return outcome ? context.json(outcome.result) : context.json({ error: "not found" }, 404)
		} catch (error) {
			return toThreadErrorResponse(context, error)
		}
	})
	.post("/notes/:id/threads/:threadId/comments", async (context) => {
		// one reply into an existing thread
		const userId = currentUser(context)
		const noteId = userId ? await loadCommentableNoteId(context, context.req.param("id")) : null
		if (!userId || !noteId) {
			return context.json({ error: "not found" }, 404)
		}

		// the store appends the comment and saves the thread
		const threadId = context.req.param("threadId")
		const body = await context.req.json()
		try {
			const outcome = await mutateNoteThreads(noteId, userId, threadId, (threadStore) =>
				threadStore.addComment({ threadId, comment: body?.comment ?? { body: undefined } }),
			)
			return outcome ? context.json(outcome.result) : context.json({ error: "not found" }, 404)
		} catch (error) {
			return toThreadErrorResponse(context, error)
		}
	})
	.put("/notes/:id/threads/:threadId/comments/:commentId", async (context) => {
		// edit one comment's body, own comments only by the store's rules
		const userId = currentUser(context)
		const noteId = userId ? await loadCommentableNoteId(context, context.req.param("id")) : null
		if (!userId || !noteId) {
			return context.json({ error: "not found" }, 404)
		}

		// the store checks the comment's ownership
		const threadId = context.req.param("threadId")
		const body = await context.req.json()
		try {
			const outcome = await mutateNoteThreads(noteId, userId, threadId, (threadStore) =>
				threadStore.updateComment({
					threadId,
					commentId: context.req.param("commentId"),
					comment: body?.comment ?? { body: undefined },
				}),
			)
			return outcome ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
		} catch (error) {
			return toThreadErrorResponse(context, error)
		}
	})
	.delete("/notes/:id/threads/:threadId/comments/:commentId", async (context) => {
		// remove one comment. the editor sends soft deletes as a query flag
		const userId = currentUser(context)
		const noteId = userId ? await loadCommentableNoteId(context, context.req.param("id")) : null
		if (!userId || !noteId) {
			return context.json({ error: "not found" }, 404)
		}

		// the store removes the thread too once every comment is gone
		const threadId = context.req.param("threadId")
		try {
			const outcome = await mutateNoteThreads(noteId, userId, threadId, (threadStore) =>
				threadStore.deleteComment({
					threadId,
					commentId: context.req.param("commentId"),
					softDelete: context.req.query("soft") === "true",
				}),
			)
			return outcome ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
		} catch (error) {
			return toThreadErrorResponse(context, error)
		}
	})
	.delete("/notes/:id/threads/:threadId", async (context) => {
		// remove a whole thread
		const userId = currentUser(context)
		const noteId = userId ? await loadCommentableNoteId(context, context.req.param("id")) : null
		if (!userId || !noteId) {
			return context.json({ error: "not found" }, 404)
		}

		// the store's auth decides who may drop a thread
		const threadId = context.req.param("threadId")
		try {
			const outcome = await mutateNoteThreads(noteId, userId, threadId, (threadStore) =>
				threadStore.deleteThread({ threadId }),
			)
			return outcome ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
		} catch (error) {
			return toThreadErrorResponse(context, error)
		}
	})
	.post("/notes/:id/threads/:threadId/resolve", async (context) => {
		// mark a thread resolved
		const userId = currentUser(context)
		const noteId = userId ? await loadCommentableNoteId(context, context.req.param("id")) : null
		if (!userId || !noteId) {
			return context.json({ error: "not found" }, 404)
		}

		// the resolve saves who resolved it
		const threadId = context.req.param("threadId")
		try {
			const outcome = await mutateNoteThreads(noteId, userId, threadId, (threadStore) =>
				threadStore.resolveThread({ threadId }),
			)
			return outcome ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
		} catch (error) {
			return toThreadErrorResponse(context, error)
		}
	})
	.post("/notes/:id/threads/:threadId/unresolve", async (context) => {
		// reopen a resolved thread
		const userId = currentUser(context)
		const noteId = userId ? await loadCommentableNoteId(context, context.req.param("id")) : null
		if (!userId || !noteId) {
			return context.json({ error: "not found" }, 404)
		}

		// the reopen clears the resolved flag
		const threadId = context.req.param("threadId")
		try {
			const outcome = await mutateNoteThreads(noteId, userId, threadId, (threadStore) =>
				threadStore.unresolveThread({ threadId }),
			)
			return outcome ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
		} catch (error) {
			return toThreadErrorResponse(context, error)
		}
	})
	.post("/notes/:id/threads/:threadId/comments/:commentId/reactions", async (context) => {
		// add one emoji reaction
		const userId = currentUser(context)
		const noteId = userId ? await loadCommentableNoteId(context, context.req.param("id")) : null
		if (!userId || !noteId) {
			return context.json({ error: "not found" }, 404)
		}

		// the reaction keys on the user and emoji, so a repeat is a no-op
		const threadId = context.req.param("threadId")
		const body = await context.req.json()
		try {
			const outcome = await mutateNoteThreads(noteId, userId, threadId, (threadStore) =>
				threadStore.addReaction({
					threadId,
					commentId: context.req.param("commentId"),
					emoji: String(body?.emoji ?? ""),
				}),
			)
			return outcome ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
		} catch (error) {
			return toThreadErrorResponse(context, error)
		}
	})
	.delete("/notes/:id/threads/:threadId/comments/:commentId/reactions/:emoji", async (context) => {
		// remove one emoji reaction
		const userId = currentUser(context)
		const noteId = userId ? await loadCommentableNoteId(context, context.req.param("id")) : null
		if (!userId || !noteId) {
			return context.json({ error: "not found" }, 404)
		}

		// only the reacting user's own key matches
		const threadId = context.req.param("threadId")
		try {
			const outcome = await mutateNoteThreads(noteId, userId, threadId, (threadStore) =>
				threadStore.deleteReaction({
					threadId,
					commentId: context.req.param("commentId"),
					emoji: context.req.param("emoji"),
				}),
			)
			return outcome ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
		} catch (error) {
			return toThreadErrorResponse(context, error)
		}
	})

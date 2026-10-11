// the note document: merging yjs updates under the note's lock, the snapshot a client syncs from, and the HTML
// regenerated from the document
import { eq, sql } from "drizzle-orm"
import sanitizeHtml from "sanitize-html"
import * as Y from "yjs"
import { db } from "../../db"
import { notes } from "../../db/schema/notes"
import { isNoteBodyChanged } from "./noteBadges"
import { notifyNoteUpdate } from "./noteStream"

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
export async function saveNoteUpdate(noteId: string, update: Uint8Array, editorUserId: string): Promise<void> {
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

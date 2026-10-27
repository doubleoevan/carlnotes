import { expect, test } from "bun:test"
import type { NoteBodySaveResult } from "@carlnotes/contracts/notes"
import { toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import { parseNoteDrafts, toNoteDraftKey } from "@carlnotes/core/lib/noteDrafts"
import { toNoteDraftStore } from "./noteDraftStore"
import { NOTE_DRAFT_CONTEXT, toNoteDraftStorage } from "./noteDraftTestFixtures"

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1))

test("rapid offline edits survive restoration at their original base and are isolated by account", async () => {
	const storage = toNoteDraftStorage()
	const store = toNoteDraftStore({ accountId: "alice", storage, canDispatch: () => false })
	await store.restore()
	const controller = store.open(toTestNote(), NOTE_DRAFT_CONTEXT)
	controller?.scheduleSave("first")
	controller?.scheduleSave("latest")
	await store.settleStorage()
	expect(parseNoteDrafts(storage.values.get(toNoteDraftKey("alice")) ?? null, "alice")[0]?.draft).toMatchObject({
		html: "latest",
		version: 3,
		revision: 2,
	})
	controller?.retire()

	// restore drafts in a fresh runtime and keep each account's storage separate
	const restored = toNoteDraftStore({ accountId: "alice", storage, canDispatch: () => false })
	const otherAccount = toNoteDraftStore({ accountId: "bob", storage, canDispatch: () => false })
	await Promise.all([restored.restore(), otherAccount.restore()])
	expect(restored.getRecoveredNote("note-1")).toMatchObject({ html: "latest", version: 3 })
	expect(otherAccount.getSnapshot().notes).toEqual([])
})

test("ordered writes coalesce and retirement drains them before deleting the account", async () => {
	const storage = toNoteDraftStorage()
	const gate = Promise.withResolvers<void>()
	const originalWrite = storage.setItem
	storage.setItem = async (key, value) => {
		await gate.promise
		await originalWrite(key, value)
	}
	const store = toNoteDraftStore({ accountId: "alice", storage, canDispatch: () => false })
	await store.restore()
	const controller = store.open(toTestNote(), NOTE_DRAFT_CONTEXT)
	controller?.scheduleSave("one")
	controller?.scheduleSave("two")
	controller?.scheduleSave("three")
	const retiring = store.retire()
	controller?.scheduleSave("too late")
	gate.resolve()
	await retiring
	expect(storage.writes).toHaveLength(1)
	expect(storage.values.has(toNoteDraftKey("alice"))).toBe(false)
	expect(store.getSnapshot().notes).toEqual([])
})

test("storage failure retains words and reports that device persistence failed", async () => {
	const storage = toNoteDraftStorage()
	let shouldFail = true
	const originalWrite = storage.setItem
	storage.setItem = async (key, value) => {
		if (shouldFail) {
			throw new Error("disk full")
		}
		await originalWrite(key, value)
	}
	const store = toNoteDraftStore({ accountId: "alice", storage, canDispatch: () => false })
	await store.restore()
	const controller = store.open(toTestNote(), NOTE_DRAFT_CONTEXT)
	controller?.scheduleSave("kept in memory")
	await store.settleStorage()
	expect(store.getSnapshot().hasStorageError).toBe(true)
	expect(store.getRecoveredNote("note-1")?.html).toBe("kept in memory")

	// a later edit retries storage and clears the warning only after acknowledgement
	shouldFail = false
	controller?.scheduleSave("durable now")
	await store.settleStorage()
	expect(store.getSnapshot().hasStorageError).toBe(false)
	expect(parseNoteDrafts(storage.values.get(toNoteDraftKey("alice")) ?? null, "alice")[0]?.draft.html).toBe(
		"durable now",
	)
	controller?.retire()
})

test("an acknowledged older revision cannot erase a newer durable edit", async () => {
	const storage = toNoteDraftStorage()
	const first = Promise.withResolvers<NoteBodySaveResult>()
	const second = Promise.withResolvers<NoteBodySaveResult>()
	const sent: { html: string; version: number }[] = []
	const store = toNoteDraftStore({
		accountId: "alice",
		storage,
		canDispatch: () => true,
		saveBody: async (_id, body) => {
			sent.push(body)
			return sent.length === 1 ? first.promise : second.promise
		},
	})
	await store.restore()
	const controller = store.open(toTestNote(), NOTE_DRAFT_CONTEXT)
	controller?.scheduleSave("first")
	controller?.flushSave()
	controller?.scheduleSave("newest")
	first.resolve({ status: "saved", version: 4 })
	await tick()
	await store.settleStorage()
	expect(store.getSnapshot().notes[0]?.draft).toMatchObject({ html: "newest", version: 4, hasPendingChanges: true })
	expect(sent).toEqual([
		{ html: "first", version: 3 },
		{ html: "newest", version: 4 },
	])
	second.resolve({ status: "saved", version: 5 })
	await tick()
	await store.settleStorage()
	expect(store.getSnapshot().notes).toEqual([])
	expect(parseNoteDrafts(storage.values.get(toNoteDraftKey("alice")) ?? null, "alice")).toEqual([])
})

test("reconnect shares the open controller and persists a closed-note conflict without rebasing", async () => {
	const storage = toNoteDraftStorage()
	let isOnline = false
	const sent: number[] = []
	const store = toNoteDraftStore({
		accountId: "alice",
		storage,
		canDispatch: () => isOnline,
		readNote: async () => toTestNote({ version: 9, html: "someone else's words" }),
		saveBody: async (_id, body) => {
			sent.push(body.version)
			return { status: "conflict", version: 9, lastEditorUsername: "bob" }
		},
	})
	await store.restore()
	const controller = store.open(toTestNote(), NOTE_DRAFT_CONTEXT)
	controller?.scheduleSave("my words")
	expect(store.open(toTestNote(), NOTE_DRAFT_CONTEXT)).toBe(controller)
	isOnline = true
	await Promise.all([store.retryPending(), store.retryPending()])
	await tick()
	await store.settleStorage()
	expect(sent).toEqual([3])
	expect(store.getSnapshot().notes[0]?.draft).toMatchObject({ html: "my words", version: 3, conflict: { version: 9 } })
	controller?.scheduleSave("more of my words")
	await store.retryPending()
	expect(sent).toEqual([3])
	controller?.retire()
})

test("revoked permission removes forbidden text and fences late controller callbacks", async () => {
	const storage = toNoteDraftStorage()
	let isOnline = false
	const store = toNoteDraftStore({
		accountId: "alice",
		storage,
		canDispatch: () => isOnline,
		readNote: async () => null,
	})
	await store.restore()
	const controller = store.open(toTestNote(), NOTE_DRAFT_CONTEXT)
	controller?.scheduleSave("private words")
	isOnline = true
	await store.retryPending()
	controller?.scheduleSave("late words")
	await store.settleStorage()
	expect(store.getSnapshot().notes).toEqual([])
	expect(store.getSnapshot().unavailableIds.has("note-1")).toBe(true)
	expect(parseNoteDrafts(storage.values.get(toNoteDraftKey("alice")) ?? null, "alice")).toEqual([])
})

test("unknown storage schemas preserve the original bytes and block destructive replacement", async () => {
	const storage = toNoteDraftStorage()
	storage.values.set(toNoteDraftKey("alice"), '{"schema":99,"notes":[]}')
	const store = toNoteDraftStore({ accountId: "alice", storage, canDispatch: () => true })
	await store.restore()
	expect(store.getSnapshot().hasStorageError).toBe(true)
	expect(store.open(toTestNote(), NOTE_DRAFT_CONTEXT)).toBeNull()
	store.flush()
	await store.settleStorage()
	expect(storage.values.get(toNoteDraftKey("alice"))).toBe('{"schema":99,"notes":[]}')
})

test("a clean reopen adopts the server baseline while pending metadata survives subsequent edits", async () => {
	const storage = toNoteDraftStorage()
	const store = toNoteDraftStore({ accountId: "alice", storage, canDispatch: () => false })
	await store.restore()
	const controller = store.open(toTestNote(), NOTE_DRAFT_CONTEXT)
	const reopened = store.open(toTestNote({ html: "saved on web", version: 8 }), NOTE_DRAFT_CONTEXT)
	expect(reopened).toBe(controller)
	expect(reopened?.getDraft()).toMatchObject({ html: "saved on web", version: 8, hasPendingChanges: false })

	// metadata updates must also apply to a later persistence callback from the same controller
	store.updateMetadata("note-1", { name: "Renamed", visibility: "public" })
	reopened?.scheduleSave("new local words")
	await store.settleStorage()
	expect(store.getRecoveredNote("note-1")).toMatchObject({
		name: "Renamed",
		visibility: "public",
		html: "new local words",
		version: 8,
	})
	await store.retire()
})

test("a new session prevents dispatch even before the old controller retires", async () => {
	const storage = toNoteDraftStorage()
	let account = "alice"
	let requests = 0
	const store = toNoteDraftStore({
		accountId: "alice",
		storage,
		canDispatch: () => account === "alice",
		saveBody: async () => {
			requests += 1
			return { status: "saved", version: 4 }
		},
	})
	await store.restore()
	const controller = store.open(toTestNote(), NOTE_DRAFT_CONTEXT)
	controller?.scheduleSave("last words")
	account = "bob"
	controller?.flushSave()
	await tick()
	expect(requests).toBe(0)
	expect(controller?.getDraft().html).toBe("last words")
	await store.retire()
	expect(storage.values.has(toNoteDraftKey("alice"))).toBe(false)
})

// closing a clean editor must release its body while another mounted editor still owns its controller
test("closed clean controllers are evicted after their last screen releases them", async () => {
	const store = toNoteDraftStore({ accountId: "alice", storage: toNoteDraftStorage(), canDispatch: () => false })
	await store.restore()
	const first = store.open(toTestNote(), NOTE_DRAFT_CONTEXT)
	expect(store.open(toTestNote(), NOTE_DRAFT_CONTEXT)).toBe(first)
	store.release("note-1")
	expect(store.open(toTestNote(), NOTE_DRAFT_CONTEXT)).toBe(first)
	store.release("note-1")
	store.release("note-1")
	const reopened = store.open(toTestNote({ html: "fresh server text" }), NOTE_DRAFT_CONTEXT)
	expect(reopened).not.toBe(first)
	expect(reopened?.getDraft().html).toBe("fresh server text")
	await store.retire()
})

// a pending controller survives closing and reopening, then leaves memory after its acknowledgement
test("closed pending controllers survive until saving finishes", async () => {
	const save = Promise.withResolvers<NoteBodySaveResult>()
	const store = toNoteDraftStore({
		accountId: "alice",
		storage: toNoteDraftStorage(),
		canDispatch: () => true,
		saveBody: () => save.promise,
	})
	await store.restore()
	const first = store.open(toTestNote(), NOTE_DRAFT_CONTEXT)
	first?.scheduleSave("pending words")
	store.release("note-1")
	expect(store.open(toTestNote(), NOTE_DRAFT_CONTEXT)).toBe(first)
	store.release("note-1")
	save.resolve({ status: "saved", version: 4 })
	await tick()
	expect(store.getSnapshot().notes).toEqual([])
	const reopened = store.open(toTestNote({ html: "pending words", version: 4 }), NOTE_DRAFT_CONTEXT)
	expect(reopened).not.toBe(first)
	expect(reopened?.getDraft().html).toBe("pending words")
	await store.retire()
})

import { afterEach, expect, test } from "bun:test"
import { toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import { loadNote } from "./noteRead"
import { toNoteDraftStore } from "./stores/noteDraftStore"
import { NOTE_DRAFT_CONTEXT, toNoteDraftStorage } from "./stores/noteDraftTestFixtures"

// restore transport after exercising real client response classification
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

// a denial must win regardless of which request has an availability failure
for (const [noteStatus, pageStatus] of [
	[403, 503],
	[503, 403],
	[404, 503],
	[503, 404],
	[401, 503],
	[503, 401],
]) {
	test(`note ${noteStatus} and page ${pageStatus} retire a recovered draft`, async () => {
		const { store, read } = await toPendingRead()
		stubReads([new Response(null, { status: noteStatus }), new Response(null, { status: pageStatus })])
		expect(await loadNote(read)).toBeNull()
		expect(store.getRecoveredNote("note-1")).toBeNull()
		expect(store.getSnapshot().unavailableIds.has("note-1")).toBe(true)
	})
}

test("missing page membership wins over a failed note request", async () => {
	const { store, read } = await toPendingRead()
	stubReads([new Response(null, { status: 503 }), Response.json({ notes: [], ...NOTE_DRAFT_CONTEXT })])
	expect(await loadNote(read)).toBeNull()
	expect(store.getRecoveredNote("note-1")).toBeNull()
})

test("a revoked edit grant retires the draft even when page loading fails", async () => {
	const { store, read } = await toPendingRead()
	stubReads([Response.json(toTestNote({ canEdit: false })), new Response(null, { status: 503 })])
	await expect(loadNote(read)).rejects.toMatchObject({ status: 503 })
	expect(store.getRecoveredNote("note-1")).toBeNull()
})

test("availability failures alone preserve the original draft", async () => {
	const { store, read } = await toPendingRead()
	stubReads([new Response(null, { status: 503 }), new TypeError("offline")])
	expect(await loadNote(read)).toMatchObject({ isOffline: true, note: { html: "local words", version: 3 } })
	expect(store.getRecoveredNote("note-1")?.html).toBe("local words")
	await store.retire()
})

test("both successful reads return fresh permissions and page context", async () => {
	const { store, read } = await toPendingRead()
	stubReads([Response.json(toTestNote()), Response.json({ ...NOTE_DRAFT_CONTEXT, notes: [toTestNote()] })])
	expect(await loadNote(read)).toMatchObject({ isOffline: false, context: NOTE_DRAFT_CONTEXT })
	await store.retire()
})

// stage an account-owned local draft without dispatching a body write
async function toPendingRead(): Promise<{
	store: ReturnType<typeof toNoteDraftStore>
	read: Parameters<typeof loadNote>[0]
}> {
	const store = toNoteDraftStore({ accountId: "alice", storage: toNoteDraftStorage(), canDispatch: () => false })
	await store.restore()
	store.open(toTestNote(), NOTE_DRAFT_CONTEXT)?.scheduleSave("local words")
	await store.settleStorage()
	return { store, read: { store, page: NOTE_DRAFT_CONTEXT, noteId: "note-1", isOnline: true } }
}

// provide independent outcomes for the note and page requests
function stubReads(responses: (Response | Error)[]): void {
	globalThis.fetch = Object.assign(
		async () => {
			const response = responses.shift()
			if (!response || response instanceof Error) {
				throw response ?? new Error("Unexpected request")
			}
			return response
		},
		{ preconnect: originalFetch.preconnect },
	)
}

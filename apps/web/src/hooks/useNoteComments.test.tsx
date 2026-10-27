import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { NoteComment } from "@carlnotes/contracts/notes"
import { useNoteComments } from "@carlnotes/core/hooks/useNoteComments"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// use real thread lifetimes and inject only transport failures and delayed responses
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
const COMMENT: NoteComment = {
	id: "one",
	body: "First",
	createdAt: "2026-10-01T12:00:00Z",
	author: null,
	canDelete: true,
}
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("failed comment loads can retry, posts append once, and rejected deletes retain their row", async () => {
	configureApiClient({ apiBaseUrl: "https://notes.test", showError: () => {} })
	let failsRead = true
	let failsDelete = true
	let posts = 0
	globalThis.fetch = (async (_input, init) => {
		if (init?.method === "POST") {
			posts += 1
			return Response.json({ ...COMMENT, id: "two", body: "Second" })
		}
		if (init?.method === "DELETE") {
			return new Response(null, { status: failsDelete ? 503 : 204 })
		}
		return failsRead ? Response.json({}, { status: 503 }) : Response.json({ comments: [COMMENT] })
	}) as typeof fetch
	const harness = await renderTestHook(() => useNoteComments("note-one"))
	cleanups.push(harness.close)
	await waitForHook(() => !harness.read().isLoading)
	expect(harness.read().hasError).toBe(true)
	failsRead = false
	await act(async () => harness.read().retry())
	await waitForHook(() => harness.read().comments.length === 1)
	await act(async () => {
		await Promise.all([harness.read().postNoteComment("Second"), harness.read().postNoteComment("Second")])
	})
	expect(posts).toBe(1)
	expect(harness.read().comments.map((comment) => comment.body)).toEqual(["First", "Second"])
	await act(async () => {
		expect(await harness.read().deleteNoteComment("one")).toBe(false)
	})
	expect(harness.read().comments).toHaveLength(2)
	failsDelete = false
	await act(async () => {
		expect(await harness.read().deleteNoteComment("one")).toBe(true)
	})
	expect(harness.read().comments.map((comment) => comment.id)).toEqual(["two"])
})

test("a previous note's late load and post cannot populate a replacement thread", async () => {
	configureApiClient({ apiBaseUrl: "https://notes.test", showError: () => {} })
	let noteId = "first"
	const posting = Promise.withResolvers<Response>()
	globalThis.fetch = (async (_input, init) =>
		init?.method === "POST" ? posting.promise : Response.json({ comments: [] })) as typeof fetch
	const harness = await renderTestHook(() => useNoteComments(noteId))
	cleanups.push(harness.close)
	await waitForHook(() => !harness.read().isLoading)
	const pending = harness.read().postNoteComment("Old note")
	noteId = "second"
	await harness.render()
	await act(async () => {
		posting.resolve(Response.json(COMMENT))
		expect(await pending).toBe(false)
	})
	expect(harness.read().comments).toEqual([])
})

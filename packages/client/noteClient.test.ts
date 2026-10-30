import { afterEach, expect, test } from "bun:test"
import { toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import { ApiResponseError } from "./apiClient"
import { stubFailingFetch, stubFetch } from "./fetchTestFixtures"
import {
	fetchNote,
	fetchNoteBadges,
	fetchNoteComments,
	fetchNotes,
	NoteReadError,
	saveNoteBody,
	sendNoteRead,
} from "./noteClient"

// restore the process fetch after each client request
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

test("strict note reads retain the stored response", async () => {
	// return the same payload the note screen consumes, read through the note contract
	const note = toTestNote({ html: "<p>A note</p>", version: 4 })
	stubFetch(Response.json(note))
	expect(await fetchNote("note-1", { shouldThrowOnError: true })).toEqual(note)
})

test.each([403, 404])("a %i note stays unavailable in strict reads", async (status) => {
	// missing and forbidden content must not be recovered as a network outage
	stubFetch(new Response(null, { status }))
	expect(await fetchNote("note-1", { shouldThrowOnError: true })).toBeNull()
})

test.each([401, 500, 503])("strict note reads reject status %i", async (status) => {
	// preserve the status for callers choosing retry or session recovery
	stubFetch(new Response(null, { status }))
	await expect(fetchNote("note-1", { shouldThrowOnError: true })).rejects.toMatchObject({ status })
})

test("strict page reads reject server failures instead of showing no notes", async () => {
	// a failed list must not become an empty creation invitation
	stubFetch(new Response(null, { status: 503 }))
	await expect(
		fetchNotes({ pageType: "topic", pageId: "topic-1" }, { shouldThrowOnError: true }),
	).rejects.toBeInstanceOf(NoteReadError)
})

test("a note that did not match its contract rejects strict reads and reads null otherwise", async () => {
	// the parse error reaches the read's own catch, which the caller's error policy decides
	stubFetch(Response.json({ nonsense: true }))
	expect(await fetchNote("note-1")).toBeNull()
	stubFetch(Response.json({ nonsense: true }))
	await expect(fetchNote("note-1", { shouldThrowOnError: true })).rejects.toBeInstanceOf(ApiResponseError)
})

test("legacy note reads return null while strict transport failures reject", async () => {
	// preserve legacy callers while allowing native draft recovery to identify offline reads
	stubFailingFetch()
	expect(await fetchNote("note-1")).toBeNull()
	await expect(fetchNote("note-1", { shouldThrowOnError: true })).rejects.toThrow("network down")
})

test("empty comments and badges are successful responses", async () => {
	// only an accepted empty response clears confirmed content
	stubFetch(Response.json({ comments: [] }))
	expect(await fetchNoteComments("note-1")).toEqual([])
	stubFetch(Response.json({ badges: [] }))
	expect(await fetchNoteBadges()).toEqual([])
})

test.each([403, 404, 500])("comments and badges reject status %i", async (status) => {
	// leave retry and retained content decisions to their shared consumers
	stubFetch(new Response(null, { status }))
	await expect(fetchNoteComments("note-1")).rejects.toMatchObject({ status })
	await expect(fetchNoteBadges()).rejects.toMatchObject({ status })
})

test("comments and badges reject transport failures", async () => {
	// offline reads must not claim an empty thread or zero unread counts
	stubFailingFetch()
	await expect(fetchNoteComments("note-1")).rejects.toThrow("network down")
	await expect(fetchNoteBadges()).rejects.toThrow("network down")
})

test("read acknowledgement reflects server acceptance and transport failure", async () => {
	// clear counts only after an accepted read
	stubFetch(new Response(null, { status: 204 }))
	expect(await sendNoteRead("note-1")).toBe(true)
	stubFetch(new Response(null, { status: 503 }))
	expect(await sendNoteRead("note-1")).toBe(false)
	stubFailingFetch()
	expect(await sendNoteRead("note-1")).toBe(false)
})

// transport failures, unavailable access, and body rejection drive different durable-draft behavior
for (const [status, expected] of [
	[400, "tooLarge"],
	[413, "tooLarge"],
	[401, "unavailable"],
	[403, "unavailable"],
	[404, "unavailable"],
	[500, "failed"],
] as const) {
	test(`save status ${status} reports ${expected}`, async () => {
		stubFetch(new Response(null, { status }))
		expect(await saveNoteBody("note-1", { html: "<p>text</p>", version: 3 })).toEqual({ status: expected })
	})
}

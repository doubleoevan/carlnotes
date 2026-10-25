// the note body save: the write at the version the editor opened at, the conflict a newer version answers, the body
// the server already holds, and the 400 and 404 that come before any write
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { notesRoute } from "./notes"
import {
	TEST_NOTE_HTML,
	TEST_NOTE_ID,
	TEST_NOTE_VERSION,
	TEST_PUBLIC_NOTE_ROW,
	TEST_PUBLIC_TEAM_ROW,
	toNoteQueryRows,
} from "./noteTestFixtures"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// a body save as the editor sends it, or a malformed one
function toBodySave(payload: Record<string, unknown>): RequestInit {
	return { ...toJsonRequest(payload), method: "PUT" }
}

// the write that moved the version, and the queries that came after the note's reads
function toWriteQueries(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => !sentQuery.text.startsWith("select"))
}

// a save naming the stored version writes the sanitized body once and answers the version after the write
test("a save at the current version writes and raises the version", async () => {
	const sentQueries = stubConnectionPool((sentQuery) =>
		toNoteQueryRows(sentQuery, (otherQuery) => (otherQuery.text.startsWith("update") ? [[4]] : [])),
	)
	const response = await toSignedInApp(notesRoute, "user-1").request(
		`/notes/${TEST_NOTE_ID}/body`,
		toBodySave({
			html: '<p>one <b>two</b><script>x()</script></p><img src="https://x.test/a.png"/>',
			version: TEST_NOTE_VERSION,
		}),
	)
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ version: 4 })

	// one write, of the sanitized body, holding at the version sent
	const [writeQuery] = toWriteQueries(sentQueries)
	expect(toWriteQueries(sentQueries)).toHaveLength(1)
	expect(writeQuery?.text).toContain('update "notes" set')
	expect(writeQuery?.text).toContain('"version" = "notes"."version" + 1')
	expect(writeQuery?.values).toContain("<p>one <b>two</b></p>")
	expect(writeQuery?.values).toContain(TEST_NOTE_VERSION)
})

// a save naming a version the server has moved past writes nothing and answers the stored version and its editor
test("a save at a stale version is a conflict", async () => {
	const sentQueries = stubConnectionPool((sentQuery) =>
		toNoteQueryRows(sentQuery, (otherQuery) => (otherQuery.text.includes('left join "users"') ? [[5, "vienna"]] : [])),
	)
	const response = await toSignedInApp(notesRoute, "user-1").request(
		`/notes/${TEST_NOTE_ID}/body`,
		toBodySave({ html: "<p>mine</p>", version: TEST_NOTE_VERSION - 1 }),
	)
	expect(response.status).toBe(409)
	expect(await response.json()).toEqual({ error: "conflict", version: 5, lastEditorUsername: "vienna" })

	// the one write returned no row, and nothing else was written
	expect(toWriteQueries(sentQueries)).toHaveLength(1)
})

// a body the server already holds writes nothing, whatever version the editor named
test("an unchanged body writes nothing", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toNoteQueryRows(sentQuery))
	const response = await toSignedInApp(notesRoute, "user-1").request(
		`/notes/${TEST_NOTE_ID}/body`,
		toBodySave({ html: TEST_NOTE_HTML, version: TEST_NOTE_VERSION - 1 }),
	)
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ version: TEST_NOTE_VERSION })
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})

// the note read returns the body and the version the next save names
test("a note read returns the body and version", async () => {
	stubConnectionPool((sentQuery) => toNoteQueryRows(sentQuery))
	const response = await toSignedInApp(notesRoute, "user-1").request(`/notes/${TEST_NOTE_ID}`)
	expect(response.status).toBe(200)
	expect(await response.json()).toMatchObject({
		id: TEST_NOTE_ID,
		html: TEST_NOTE_HTML,
		version: TEST_NOTE_VERSION,
		canEdit: true,
		isNoteOwner: false,
	})
})

// a body outside the payload is a 400 before the note is read
test("a bad body is a 400 before any query", async () => {
	const sentQueries = stubConnectionPool()
	const signedInApp = toSignedInApp(notesRoute, "user-1")
	const noVersionResponse = await signedInApp.request(`/notes/${TEST_NOTE_ID}/body`, toBodySave({ html: "<p>x</p>" }))
	const stringVersionResponse = await signedInApp.request(
		`/notes/${TEST_NOTE_ID}/body`,
		toBodySave({ html: "<p>x</p>", version: "3" }),
	)
	expect([noVersionResponse.status, stringVersionResponse.status]).toEqual([400, 400])
	expect(sentQueries).toHaveLength(0)
})

// a visitor's save is a missing note before the body is read
test("a visitor's save is a 404 before any query", async () => {
	const sentQueries = stubConnectionPool()
	const visitorApp = new Hono<AppEnv>().route("/", notesRoute)
	const response = await visitorApp.request(`/notes/${TEST_NOTE_ID}/body`, toBodySave({ html: "<p>x</p>", version: 1 }))
	expect(response.status).toBe(404)
	expect(sentQueries).toHaveLength(0)
})

// a signed-in user outside the team neither reads nor writes its note, and nothing is written
test("a non-member's read and save are 404s", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toNoteQueryRows(sentQuery, () => [], { team_members: [] }))
	const signedInApp = toSignedInApp(notesRoute, "user-1")
	const readResponse = await signedInApp.request(`/notes/${TEST_NOTE_ID}`)
	const saveResponse = await signedInApp.request(
		`/notes/${TEST_NOTE_ID}/body`,
		toBodySave({ html: "<p>x</p>", version: TEST_NOTE_VERSION }),
	)
	expect([readResponse.status, saveResponse.status]).toEqual([404, 404])
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})

// a signed-in user who may read a public note on a public team, but neither owns it nor belongs to the team, cannot
// save it
test("a reader without edit access cannot save", async () => {
	const sentQueries = stubConnectionPool((sentQuery) =>
		toNoteQueryRows(sentQuery, () => [], {
			notes: [TEST_PUBLIC_NOTE_ROW],
			teams: [TEST_PUBLIC_TEAM_ROW],
			team_members: [],
		}),
	)
	const signedInApp = toSignedInApp(notesRoute, "user-1")
	const readResponse = await signedInApp.request(`/notes/${TEST_NOTE_ID}`)
	const saveResponse = await signedInApp.request(
		`/notes/${TEST_NOTE_ID}/body`,
		toBodySave({ html: "<p>x</p>", version: TEST_NOTE_VERSION }),
	)
	expect([readResponse.status, saveResponse.status]).toEqual([200, 404])
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})

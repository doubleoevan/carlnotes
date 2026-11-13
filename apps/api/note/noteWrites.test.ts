// the note writes as a module: a body save at a stale version, the Terms before any write, and a delete that is not
// the user's
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { TEST_NOTE_ID, TEST_NOTE_VERSION, toNoteQueryRows } from "./noteTestFixtures"
import { deleteNote, saveNoteBodyEdit } from "./noteWrites"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// the queries that wrote
function toWriteQueries(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => !sentQuery.text.startsWith("select"))
}

// a save at a version the server moved past returns the stored version and its editor, and writes nothing more
test("a body save at a stale version returns the conflict", async () => {
	const sentQueries = stubConnectionPool((sentQuery) =>
		toNoteQueryRows(sentQuery, (otherQuery) => (otherQuery.text.includes('left join "users"') ? [[5, "vienna"]] : [])),
	)
	const saveResult = await saveNoteBodyEdit({
		userId: "user-1",
		isTermsCurrent: true,
		noteId: TEST_NOTE_ID,
		html: "<p>mine</p>",
		version: TEST_NOTE_VERSION - 1,
	})
	expect(saveResult).toEqual({ status: "conflict", version: 5, lastEditorUsername: "vienna" })
	expect(toWriteQueries(sentQueries)).toHaveLength(1)
})

// an account behind on the Terms writes nothing
test("a body save behind on the Terms writes nothing", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toNoteQueryRows(sentQuery))
	const saveResult = await saveNoteBodyEdit({
		userId: "user-1",
		isTermsCurrent: false,
		noteId: TEST_NOTE_ID,
		html: "<p>mine</p>",
		version: TEST_NOTE_VERSION,
	})
	expect(saveResult).toEqual({ status: "termsOutdated" })
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})

// a teammate's note is not the user's to delete
test("a delete of a teammate's note writes nothing", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toNoteQueryRows(sentQuery))
	expect(await deleteNote({ userId: "user-1", noteId: TEST_NOTE_ID })).toEqual({ status: "notFound" })
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})

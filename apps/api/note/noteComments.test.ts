// the note comment routes: the thread's shape, the post behind edit access, the author's own delete, and the 400 a bad
// body gets before any query
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { noteCommentsRoute } from "./noteComments"
import { TEST_NOTE_ID, TEST_PUBLIC_NOTE_ROW, TEST_PUBLIC_TEAM_ROW, toNoteQueryRows } from "./noteTestFixtures"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// one comment row as the thread's read selects it: the comment, then its author's name and avatar
const NOTE_COMMENT_ROW = ["c1", "hello", "2026-08-30T10:00:00.000Z", "user-2", "vienna", "generated", null]

// the thread lists each comment with its author and whether the user may delete it
test("the thread lists comments with their authors", async () => {
	stubConnectionPool((sentQuery) =>
		toNoteQueryRows(sentQuery, (otherQuery) =>
			otherQuery.text.includes('from "note_comments"') ? [NOTE_COMMENT_ROW] : [],
		),
	)
	const response = await toSignedInApp(noteCommentsRoute, "user-1").request(`/notes/${TEST_NOTE_ID}/comments`)
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({
		comments: [
			{
				id: "c1",
				body: "hello",
				createdAt: "2026-08-30T10:00:00.000Z",
				author: { userId: "user-2", username: "vienna", avatarSource: "generated", avatarVersion: null },
				canDelete: false,
			},
		],
	})
})

// a member's post writes the trimmed text on the note and returns the comment as the thread shows it, with the
// session user as its author and no read back
test("a team member posts a comment", async () => {
	const sentQueries = stubConnectionPool((sentQuery) =>
		toNoteQueryRows(sentQuery, (otherQuery) =>
			otherQuery.text.startsWith("insert") ? [["c9", "a thought", "2026-08-30T12:00:00.000Z", "user-1"]] : [],
		),
	)
	const response = await toSignedInApp(noteCommentsRoute, "user-1").request(
		`/notes/${TEST_NOTE_ID}/comments`,
		toJsonRequest({ body: "  a thought  " }),
	)
	expect(response.status).toBe(200)
	expect(await response.json()).toMatchObject({
		id: "c9",
		body: "a thought",
		canDelete: true,
		author: { userId: "user-1", username: "user-1", avatarSource: null, avatarVersion: null },
	})

	// the insert names the note and the author, with the body trimmed, and nothing reads the comment back
	const insertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith("insert"))
	expect(insertQuery?.values).toEqual(expect.arrayContaining([TEST_NOTE_ID, "user-1", "a thought"]))
	expect(sentQueries.filter((sentQuery) => sentQuery.text.includes('from "note_comments"'))).toHaveLength(0)
})

// a delete names the comment, the note, and the author, so another user's comment stays
test("only the author deletes a comment", async () => {
	// the delete returns a row for the author and none for anybody else
	const toDeleteRows = (authorUserId: string) => (sentQuery: SentQuery) =>
		toNoteQueryRows(sentQuery, (otherQuery) =>
			otherQuery.text.startsWith("delete") && otherQuery.values.includes(authorUserId) ? [["c1"]] : [],
		)
	stubConnectionPool(toDeleteRows("user-2"))
	const otherResponse = await toSignedInApp(noteCommentsRoute, "user-1").request(`/notes/${TEST_NOTE_ID}/comments/c1`, {
		method: "DELETE",
	})
	expect(otherResponse.status).toBe(404)

	// the author's own delete goes through
	restoreConnectionPool()
	const sentQueries = stubConnectionPool(toDeleteRows("user-1"))
	const authorResponse = await toSignedInApp(noteCommentsRoute, "user-1").request(
		`/notes/${TEST_NOTE_ID}/comments/c1`,
		{ method: "DELETE" },
	)
	expect(authorResponse.status).toBe(200)
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith("delete"))
	expect(deleteQuery?.values).toEqual(expect.arrayContaining(["c1", TEST_NOTE_ID, "user-1"]))
})

// a signed-in user outside the team may not post on its note, and nothing is inserted
test("a non-member's post is a 404 with no insert", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toNoteQueryRows(sentQuery, () => [], { team_members: [] }))
	const response = await toSignedInApp(noteCommentsRoute, "user-1").request(
		`/notes/${TEST_NOTE_ID}/comments`,
		toJsonRequest({ body: "a thought" }),
	)
	expect(response.status).toBe(404)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("insert"))).toBe(false)
})

// a visitor reads a public note's thread on a public team, with nothing of their own to delete
test("a visitor reads a public note's thread", async () => {
	stubConnectionPool((sentQuery) =>
		toNoteQueryRows(
			sentQuery,
			(otherQuery) => (otherQuery.text.includes('from "note_comments"') ? [NOTE_COMMENT_ROW] : []),
			{
				notes: [TEST_PUBLIC_NOTE_ROW],
				teams: [TEST_PUBLIC_TEAM_ROW],
				team_members: [],
			},
		),
	)
	const visitorApp = new Hono<AppEnv>().route("/", noteCommentsRoute)
	const response = await visitorApp.request(`/notes/${TEST_NOTE_ID}/comments`)
	expect(response.status).toBe(200)
	expect((await response.json()).comments.map((comment: { canDelete: boolean }) => comment.canDelete)).toEqual([false])
})

// a body outside the payload is a 400 before the note is read
test("a bad comment body is a 400 before any query", async () => {
	const sentQueries = stubConnectionPool()
	const signedInApp = toSignedInApp(noteCommentsRoute, "user-1")
	const emptyResponse = await signedInApp.request(`/notes/${TEST_NOTE_ID}/comments`, toJsonRequest({ body: "   " }))
	const longResponse = await signedInApp.request(
		`/notes/${TEST_NOTE_ID}/comments`,
		toJsonRequest({ body: "x".repeat(2001) }),
	)
	const unparsedResponse = await signedInApp.request(`/notes/${TEST_NOTE_ID}/comments`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: "not json",
	})
	expect([emptyResponse.status, longResponse.status, unparsedResponse.status]).toEqual([400, 400, 400])
	expect(sentQueries).toHaveLength(0)
})

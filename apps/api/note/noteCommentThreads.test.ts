// note comment route tests: the thread, comment, and reaction bodies the editor's thread store sends, and the 400 a
// body outside those shapes gets before any write
import { afterEach, expect, test } from "bun:test"
import { noteCommentThreadPayload } from "@carlnotes/contracts/payloads"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { noteCommentThreadsRoute } from "./noteCommentThreads"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// the editor's thread store sends a comment as a blocknote document, an array of blocks
test("noteCommentThreadPayload takes a block array and rejects anything else", () => {
	expect(noteCommentThreadPayload.safeParse({ initialComment: { body: [{ type: "paragraph" }] } }).success).toBe(true)
	expect(noteCommentThreadPayload.safeParse({ initialComment: { body: "hello" } }).success).toBe(false)
	expect(noteCommentThreadPayload.safeParse({ initialComment: { body: [] } }).success).toBe(false)
	expect(noteCommentThreadPayload.safeParse({}).success).toBe(false)
})

// a body the payloads reject, or no json at all, is a 400 before the note is even read
test("a bad comment body is a 400", async () => {
	const sentQueries = stubConnectionPool()
	const signedInApp = toSignedInApp(noteCommentThreadsRoute, "user-1")

	// a thread whose first comment is not a document, a reply with no comment, an edit with a string body, and a
	// reaction with no emoji
	const threadResponse = await signedInApp.request(
		"/notes/n1/threads",
		toJsonRequest({ initialComment: { body: "hi" } }),
	)
	const replyResponse = await signedInApp.request("/notes/n1/threads/t1/comments", toJsonRequest({}))
	const editResponse = await signedInApp.request("/notes/n1/threads/t1/comments/c1", {
		...toJsonRequest({ comment: { body: "hi" } }),
		method: "PUT",
	})
	const reactionResponse = await signedInApp.request(
		"/notes/n1/threads/t1/comments/c1/reactions",
		toJsonRequest({ emoji: "" }),
	)
	expect([threadResponse.status, replyResponse.status, editResponse.status, reactionResponse.status]).toEqual([
		400, 400, 400, 400,
	])

	// a body that is not json at all
	const unparsedResponse = await signedInApp.request("/notes/n1/threads", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: "not json",
	})
	expect(unparsedResponse.status).toBe(400)
	expect(sentQueries).toHaveLength(0)
})

// api tree tests: a session read rejected with a 401 reads as signed out, any other failure fails the request, an
// oversized body is rejected before its route, and a visitor's chat post and upload are rejected before their bodies
// are read
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { NOTE_HTML_MAX_CHARS } from "@carlnotes/contracts/notes"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { MAX_ATTACHMENT_BYTES } from "@carlnotes/pipeline/attach"
import { APIError } from "better-auth"
import { apiRoute } from "./api"
import { auth } from "./auth"
import { MAX_AVATAR_BYTES } from "./avatars"
import { MULTIPART_ENVELOPE_BYTES } from "./bodyLimit"
import { SIGNUP_REQUIRED_ERROR } from "./chat/chatTurnAuthorization"
import { signInAs, toJsonRequest } from "./testSession"

// put the spied session read and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// a revoked session's refresh throws a 401 error, and the request goes on to its route signed out instead of failing
test("a session read rejected as unauthorized reads as signed out", async () => {
	spyOn(auth.api, "getSession").mockRejectedValue(new APIError("UNAUTHORIZED", { message: "Failed to get session" }))
	const response = await apiRoute.request("/api/signup-gate", toJsonRequest({}))
	expect(response.status).toBe(400)
})

// any other failure of the session read still fails the request
test("a session read that fails otherwise fails the request", async () => {
	spyOn(auth.api, "getSession").mockRejectedValue(new Error("database unreachable"))
	const response = await apiRoute.request("/api/signup-gate", toJsonRequest({}))
	expect(response.status).toBe(500)
})

// a body past a megabyte is rejected before the route reads it, on every route with no limit of its own
test("an oversized body is rejected with a 413 before the route reads it", async () => {
	signInAs(null)
	const response = await apiRoute.request(
		"/api/signup-gate",
		toJsonRequest({ turnstileToken: "x".repeat(1024 * 1024 + 1) }),
	)
	expect(response.status).toBe(413)
	expect(await response.json()).toEqual({ error: "request body too large" })
})

// the chat routes keep their own larger limit, and a visitor's post is rejected before its body is read
test("a visitor's chat post is rejected before its body is read, under the chat routes' own limit", async () => {
	stubRedisClient()
	signInAs(null)
	const largeChatPost = toJsonRequest({ question: "hi", attachments: [{ dataUrl: "x".repeat(2 * 1024 * 1024) }] })

	// each chat post responds with the sign-up rejection, never a 413
	for (const path of ["/api/topics/t1/chat", "/api/teams/t1/chat", "/api/chat/new-topic"]) {
		const response = await apiRoute.request(path, largeChatPost)
		expect(response.status).toBe(401)
		expect(await response.json()).toEqual({ error: SIGNUP_REQUIRED_ERROR })
	}

	// each chat room post responds like a missing chat room, never a 413
	for (const path of ["/api/teams/t1/room", "/api/topics/t1/rooms/team-1"]) {
		const response = await apiRoute.request(path, largeChatPost)
		expect(response.status).toBe(404)
		expect(await response.json()).toEqual({ error: "not found" })
	}
})

// the transcription route keeps its own limit above the default, so a recording past a megabyte reaches the route,
// where a visitor is rejected before the limit reads it
test("a visitor's recording past the default limit is rejected with a 401, never a 413", async () => {
	stubRedisClient()
	signInAs(null)
	const response = await apiRoute.request("/api/chat/transcription", {
		method: "POST",
		headers: { "content-type": "multipart/form-data; boundary=x" },
		body: "x".repeat(2 * 1024 * 1024),
	})
	expect(response.status).toBe(401)
	expect(await response.json()).toEqual({ error: SIGNUP_REQUIRED_ERROR })
})

// an upload route limits its body above the default, and a visitor's upload is rejected before that limit reads it
test("a visitor's avatar or attachment upload is rejected with a 401 before its body is read", async () => {
	// a body past both upload limits, posted by a visitor
	signInAs(null)
	const oversizedUpload = "x".repeat(Math.max(MAX_AVATAR_BYTES, MAX_ATTACHMENT_BYTES) + MULTIPART_ENVELOPE_BYTES + 1)

	// each upload responds with the sign-in rejection, never a 413
	for (const path of ["/api/avatars", "/api/teams/t1/avatar", "/api/topics/t1/attachments"]) {
		const response = await apiRoute.request(path, {
			method: "POST",
			headers: { "content-type": "multipart/form-data; boundary=x" },
			body: oversizedUpload,
		})
		expect(response.status).toBe(401)
		expect(await response.json()).toEqual({ error: "unauthorized" })
	}
})

// the note body save keeps its own limit, sized for the longest body in any encoding, and rejects a body past it with
// a 413. a visitor's save responds like a missing note before the limit reads the body
test("a note body save past its own limit is rejected with a 413 before the route reads it", async () => {
	// a body past the limit, sent by a signed-in user and by a visitor
	const oversizedNoteBody = {
		...toJsonRequest({ html: "x".repeat(NOTE_HTML_MAX_CHARS * 4 + 1024), version: 1 }),
		method: "PUT",
	}
	signInAs("user-1")
	const signedInResponse = await apiRoute.request("/api/notes/n1/body", oversizedNoteBody)
	expect(signedInResponse.status).toBe(413)
	expect(await signedInResponse.json()).toEqual({ error: "request body too large" })

	// the visitor's save responds 404
	signInAs(null)
	expect((await apiRoute.request("/api/notes/n1/body", oversizedNoteBody)).status).toBe(404)
})

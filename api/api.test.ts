// api tree tests: a session read rejected with a 401 reads as signed out, any other failure fails the request, an
// oversized body is rejected before its route, and a visitor's chat post is rejected before its body is read
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { NOTE_UPDATE_MAX_CHARS } from "@shared/contracts"
import { APIError } from "better-auth"
import { restoreRedisClient, stubRedisClient } from "../db/redisClientStub"
import { apiRoute } from "./api"
import { auth } from "./auth"
import { signInAs } from "./testSession"

// put the spied session read and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// a revoked session's refresh throws a 401 error, and the request goes on to its route signed out instead of failing
test("a session read rejected as unauthorized reads as signed out", async () => {
	spyOn(auth.api, "getSession").mockRejectedValue(new APIError("UNAUTHORIZED", { message: "Failed to get session" }))
	const response = await apiRoute.request("/api/signup-gate", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: "{}",
	})
	expect(response.status).toBe(400)
})

// any other failure of the session read still fails the request
test("a session read that fails otherwise fails the request", async () => {
	spyOn(auth.api, "getSession").mockRejectedValue(new Error("database unreachable"))
	const response = await apiRoute.request("/api/signup-gate", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: "{}",
	})
	expect(response.status).toBe(500)
})

// a body past a megabyte is rejected before the route reads it, on every route with no limit of its own
test("an oversized body is rejected with a 413 before the route reads it", async () => {
	signInAs(null)
	const response = await apiRoute.request("/api/signup-gate", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ turnstileToken: "x".repeat(1024 * 1024 + 1) }),
	})
	expect(response.status).toBe(413)
	expect(await response.json()).toEqual({ error: "request body too large" })
})

// the chat routes keep their own larger limit, and a visitor's post is rejected before its body is read
test("a visitor's chat post is rejected before its body is read, under the chat routes' own limit", async () => {
	stubRedisClient()
	signInAs(null)
	const largeBody = JSON.stringify({ question: "hi", attachments: [{ dataUrl: "x".repeat(2 * 1024 * 1024) }] })

	// each chat post responds with the sign-up rejection, never a 413
	for (const path of ["/api/topics/t1/chat", "/api/teams/t1/chat", "/api/chat/new-topic"]) {
		const response = await apiRoute.request(path, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: largeBody,
		})
		expect(response.status).toBe(401)
		expect(await response.json()).toEqual({ error: "sign up required" })
	}

	// each chat room post responds like a missing chat room, never a 413
	for (const path of ["/api/teams/t1/room", "/api/topics/t1/rooms/team-1"]) {
		const response = await apiRoute.request(path, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: largeBody,
		})
		expect(response.status).toBe(404)
		expect(await response.json()).toEqual({ error: "not found" })
	}
})

// the note sync post keeps its own limit, sized for one update at its largest, and rejects a body past it with a 413.
// a visitor's post responds like a missing note before the limit reads the body
test("a note sync post past its own limit is rejected with a 413 before the route reads it", async () => {
	// a body past the limit, posted by a signed-in user and by a visitor
	const oversizedNoteSync = {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ update: "x".repeat(NOTE_UPDATE_MAX_CHARS + 1024) }),
	}
	signInAs("user-1")
	const signedInResponse = await apiRoute.request("/api/notes/n1/updates", oversizedNoteSync)
	expect(signedInResponse.status).toBe(413)
	expect(await signedInResponse.json()).toEqual({ error: "request body too large" })

	// the visitor's post responds 404
	signInAs(null)
	expect((await apiRoute.request("/api/notes/n1/updates", oversizedNoteSync)).status).toBe(404)
})

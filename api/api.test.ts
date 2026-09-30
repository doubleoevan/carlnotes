// api tree tests: a session read rejected with a 401 reads as signed out, and any other failure fails the request
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { APIError } from "better-auth"
import { apiRoute } from "./api"
import { auth } from "./auth"

// put the spied session read back after each test
afterEach(() => {
	mock.restore()
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

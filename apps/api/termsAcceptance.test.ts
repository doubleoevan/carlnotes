// terms acceptance tests: a stale session's write gets the terms-outdated 403 and a current one passes, the acceptance
// route writes the published version and refreshes the sessions, and the row read serves a write with no session
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { TERMS_VERSION } from "@carlnotes/contracts/terms"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { Hono } from "hono"
import type { AppEnv } from "./currentUser"
import * as sessions from "./sessions"
import { hasAcceptedCurrentTerms, termsAcceptanceRoute, toTermsOutdatedResponse } from "./termsAcceptance"
import { signInAs, toJsonRequest, toSignedInApp } from "./testSession"

// put the spied session refresh and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// a route that applies the gate, returning ok past it
function toGatedApp(termsAcceptedVersion: string | null): Hono<AppEnv> {
	return new Hono<AppEnv>()
		.use("*", async (context, next) => {
			context.set("user", { id: "user-1", termsAcceptedVersion } as never)
			await next()
		})
		.post("/write", (context) => toTermsOutdatedResponse(context) ?? context.json({ ok: true }))
}

// a stale version and a missing one are rejected with the published version named, and the current one passes
test("a stale account's write is rejected and a current one passes", async () => {
	const staleResponse = await toGatedApp("2026-01-01").request("/write", toJsonRequest({}))
	expect(staleResponse.status).toBe(403)
	expect(await staleResponse.json()).toEqual({ rejection: "termsOutdated", termsVersion: TERMS_VERSION })
	expect((await toGatedApp(null).request("/write", toJsonRequest({}))).status).toBe(403)
	expect((await toGatedApp(TERMS_VERSION).request("/write", toJsonRequest({}))).status).toBe(200)
})

// accepting writes the published version and the time, then rewrites the user's sessions
test("accepting records the published version and refreshes the sessions", async () => {
	const refreshSessionUserSpy = spyOn(sessions, "refreshSessionUser").mockResolvedValue(undefined)
	const sentQueries = stubConnectionPool(() => [])
	const response = await toSignedInApp(termsAcceptanceRoute, "user-1").request(
		"/users/me/terms-acceptance",
		toJsonRequest({}),
	)
	expect(response.status).toBe(200)
	expect(await response.json()).toMatchObject({ termsVersion: TERMS_VERSION })

	// the update names the version and the user, and the sessions follow
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "users"'))
	expect(updateQuery?.values).toEqual(expect.arrayContaining([TERMS_VERSION, "user-1"]))
	expect(refreshSessionUserSpy).toHaveBeenCalledWith("user-1")
})

// a signed-out visitor is rejected before anything is written
test("a visitor cannot accept", async () => {
	signInAs(null)
	const sentQueries = stubConnectionPool(() => [])
	const response = await termsAcceptanceRoute.request("/users/me/terms-acceptance", toJsonRequest({}))
	expect(response.status).toBe(401)
	expect(sentQueries).toHaveLength(0)
})

// the row read serves a write that has no session, such as a topic a tool saves
test("the row read says whether the account accepted the published version", async () => {
	stubConnectionPool(() => [[TERMS_VERSION]])
	expect(await hasAcceptedCurrentTerms("user-1")).toBe(true)
	stubConnectionPool(() => [["2026-01-01"]])
	expect(await hasAcceptedCurrentTerms("user-1")).toBe(false)
})

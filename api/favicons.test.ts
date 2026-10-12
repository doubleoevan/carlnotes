// favicon route tests for the path a host's icon is served at, and the policy the icon is served with
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import * as store from "../worker/store"
import { faviconsRoute, toFaviconPath } from "./favicons"

// put the pool's own query and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a host with a port has a colon, which the path escapes so the route reads one segment
test("toFaviconPath encodes the host as one path segment", () => {
	expect(toFaviconPath("jobs.ashbyhq.com")).toBe("/api/favicons/jobs.ashbyhq.com")
	expect(toFaviconPath("localhost:5173")).toBe("/api/favicons/localhost%3A5173")
})

// an icon opened as a page sets its own policy, which keeps a base url and a form on this origin like the default one
test("a stored icon is served with a policy that keeps a base url and a form on this origin", async () => {
	// one stored icon row, with its object key and type, and its bytes read from a stub
	stubConnectionPool(() => [["favicons/example.com", "image/png"]])
	spyOn(store, "attachmentStream").mockReturnValue(new Blob(["icon"]).stream())
	const response = await faviconsRoute.request("/favicons/example.com")

	// the icon, with the sandboxed policy and both directives
	expect(response.status).toBe(200)
	const contentSecurityPolicy = response.headers.get("Content-Security-Policy") ?? ""
	expect(contentSecurityPolicy).toContain("sandbox")
	expect(contentSecurityPolicy).toContain("base-uri 'self'")
	expect(contentSecurityPolicy).toContain("form-action 'self'")
})

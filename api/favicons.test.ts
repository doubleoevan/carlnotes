// favicon route tests for the path a host's icon is served at
import { expect, test } from "bun:test"
import { toFaviconPath } from "./favicons"

// a host with a port has a colon, which the path escapes so the route reads one segment
test("toFaviconPath encodes the host as one path segment", () => {
	expect(toFaviconPath("jobs.ashbyhq.com")).toBe("/api/favicons/jobs.ashbyhq.com")
	expect(toFaviconPath("localhost:5173")).toBe("/api/favicons/localhost%3A5173")
})

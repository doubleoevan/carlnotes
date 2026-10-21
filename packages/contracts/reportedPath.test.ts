// the path a page is reported as, which never includes an id or a topic's name
import { expect, test } from "bun:test"
import { toReportedPath } from "./reportedPath"

// a topic id in the path would make one report row per topic, and would attach that topic to a signed-out visitor
test("an id segment reports as its route's shape", () => {
	expect(toReportedPath("/topics/bffe43c2-f706-4f92-88bd-df0c9fd8f9e8")).toBe("/topics/:id")
	expect(toReportedPath("/profiles/MUS2ooDu0NOPZ4HcwbnokUOofwr4tMWa")).toBe("/profiles/:userId")
	expect(toReportedPath("/teams/team-1")).toBe("/teams/:teamId")
	expect(toReportedPath("/invite/a-long-invite-token")).toBe("/invite/:token")
})

// a path with no id reports as it is, including the index of a route with ids, such as /teams
test("a path with no id is reported unchanged", () => {
	expect(toReportedPath("/")).toBe("/")
	expect(toReportedPath("/teams")).toBe("/teams")
	expect(toReportedPath("/activity")).toBe("/activity")
	expect(toReportedPath("/mcp/consent")).toBe("/mcp/consent")
})

// anything after the id keeps its place, so a deeper route still reads as one page
test("a segment after the id is kept", () => {
	expect(toReportedPath("/teams/team-1/settings")).toBe("/teams/:teamId/settings")
})

// a topic's slug is its name, and a private topic's name never reaches the report
test("a topic's slug is reported by its shape", () => {
	expect(toReportedPath("/topics/bffe43c2/getting-a-literary-agent")).toBe("/topics/:id/:slug")
	expect(toReportedPath("/topics/bffe43c2")).toBe("/topics/:id")
})

// a route named like a built-in object key is not a route with an id, so it reports as it is
test("a route named like an object key is reported unchanged", () => {
	expect(toReportedPath("/constructor/x")).toBe("/constructor/x")
	expect(toReportedPath("/toString/x")).toBe("/toString/x")
})

// a feed token opens a listener's private feed, so no report may include a feed token
test("a podcast feed token reports as its route's shape", () => {
	expect(toReportedPath("/podcast-feeds/Zm9vYmFyLXRva2Vu.xml")).toBe("/podcast-feeds/:token")
})

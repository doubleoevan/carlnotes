// the path a visit reports, which never includes an id
import { expect, test } from "bun:test"
import { toReportedEvent, toReportedPath } from "./visitAnalytics"

// a topic id in the path would make one report row per topic, and would attach that topic to a signed-out visitor
test("an id segment reports as its route's shape", () => {
	expect(toReportedPath("/topics/bffe43c2-f706-4f92-88bd-df0c9fd8f9e8")).toBe("/topics/:id")
	expect(toReportedPath("/profiles/MUS2ooDu0NOPZ4HcwbnokUOofwr4tMWa")).toBe("/profiles/:userId")
	expect(toReportedPath("/teams/team-1")).toBe("/teams/:teamId")
	expect(toReportedPath("/invite/a-long-invite-token")).toBe("/invite/:token")
})

// a route that holds no id reports as it is, including the one whose name matches a route that does
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

// the settings that keep a visit off the device and unidentified, asserted on the visitAnalytics.ts source
test("the client is configured to store nothing and identify nobody", async () => {
	const visitAnalyticsSource = await Bun.file(new URL("./visitAnalytics.ts", import.meta.url)).text()
	// no cookie, no profile, and no automatic capture or recording
	expect(visitAnalyticsSource).toContain('cookieless_mode: "always"')
	expect(visitAnalyticsSource).toContain('person_profiles: "never"')
	expect(visitAnalyticsSource).toContain("autocapture: false")
	expect(visitAnalyticsSource).toContain("disable_session_recording: true")
	// a page view is reported by hand, with its ids taken out
	expect(visitAnalyticsSource).toContain("capture_pageview: false")
	expect(visitAnalyticsSource).toContain("before_send: toReportedEvent")
})

// identifying a visitor would undo cookieless tracking, so nothing in the ui may call it
test("nothing in the ui identifies a visitor", async () => {
	const uiFiles = new Bun.Glob("**/*.{ts,tsx}").scanSync({ cwd: new URL("../", import.meta.url).pathname })
	const identifyingFiles: string[] = []
	// collect every ui file that calls PostHog's identify or alias
	for (const uiFile of uiFiles) {
		const source = await Bun.file(new URL(`../${uiFile}`, import.meta.url)).text()
		if (/posthog\.(identify|alias)\s*\(/.test(source)) {
			identifyingFiles.push(uiFile)
		}
	}
	expect(identifyingFiles).toEqual([])
})

// posthog attaches the url to every event and captures the page leave on its own, so sanitizing the one page view
// this app captures would still ship the id in the url and in every automatic event
test("every event has its id taken out of both the url and the path", () => {
	const reportedEvent = toReportedEvent({
		event: "$pageleave",
		properties: {
			$current_url: "https://carlnotes.com/topics/bffe43c2-f706-4f92-88bd-df0c9fd8f9e8?ref=x",
			$pathname: "/topics/bffe43c2-f706-4f92-88bd-df0c9fd8f9e8",
		},
	} as never)
	expect(reportedEvent?.properties.$current_url).toBe("https://carlnotes.com/topics/:id?ref=x")
	expect(reportedEvent?.properties.$pathname).toBe("/topics/:id")
})

// an event with nothing to rewrite passes through, so the hook never drops one
test("an event with no url or path is returned unchanged", () => {
	expect(toReportedEvent(null)).toBeNull()
	const plainEvent = { event: "$pageview", properties: {} }
	expect(toReportedEvent(plainEvent as never)).toBe(plainEvent as never)
})

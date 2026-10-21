// the path a visit reports, which never includes an id
import { expect, test } from "bun:test"
import { toReportedEvent } from "./visitAnalytics"

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
test("every event has its id taken out of both the url and the path, and the url's query string dropped", () => {
	const reportedEvent = toReportedEvent({
		event: "$pageleave",
		properties: {
			$current_url: "https://carlnotes.com/topics/bffe43c2-f706-4f92-88bd-df0c9fd8f9e8?ref=x",
			$pathname: "/topics/bffe43c2-f706-4f92-88bd-df0c9fd8f9e8",
		},
	} as never)
	expect(reportedEvent?.properties.$current_url).toBe("https://carlnotes.com/topics/:id")
	expect(reportedEvent?.properties.$pathname).toBe("/topics/:id")
})

// a visit event's own properties stay as sent, while its url is rewritten with every other event's
test("a visit event keeps its own properties and has its url rewritten", () => {
	const reportedEvent = toReportedEvent({
		event: "visit_topic_viewed",
		properties: {
			$current_url: "https://carlnotes.com/topics/bffe43c2-f706-4f92-88bd-df0c9fd8f9e8/agents",
			topicId: "bffe43c2-f706-4f92-88bd-df0c9fd8f9e8",
		},
	} as never)
	expect(reportedEvent?.properties.$current_url).toBe("https://carlnotes.com/topics/:id/:slug")
	expect(reportedEvent?.properties.topicId).toBe("bffe43c2-f706-4f92-88bd-df0c9fd8f9e8")
})

// the previous page's path, which posthog attaches to a page view and a page leave, loses its id too
test("the previous page's path has its id taken out", () => {
	const reportedEvent = toReportedEvent({
		event: "$pageview",
		properties: { $prev_pageview_pathname: "/profiles/5f3c9a", $referrer: "https://carlnotes.com/invite/abc123" },
	} as never)
	expect(reportedEvent?.properties.$prev_pageview_pathname).toBe("/profiles/:userId")
	expect(reportedEvent?.properties.$referrer).toBe("https://carlnotes.com/invite/:token")
})

// a web vitals event repeats the url inside each metric, as the metric's url and as its navigation's
test("every web vitals metric has its id taken out of its urls", () => {
	const topicUrl = "https://carlnotes.com/topics/bffe43c2/agents-weekly?token=secret-vitals"
	const reportedEvent = toReportedEvent({
		event: "$web_vitals",
		properties: {
			$current_url: topicUrl,
			$web_vitals_LCP_value: 1840,
			$web_vitals_LCP_event: { name: "LCP", value: 1840, $current_url: topicUrl, navigationURL: topicUrl },
			$web_vitals_INP_event: { name: "INP", value: 96, $current_url: topicUrl },
		},
	} as never)

	// the event's url and every metric's report the route's shape, and the id is nowhere
	const reportedUrl = "https://carlnotes.com/topics/:id/:slug"
	expect(reportedEvent?.properties.$current_url).toBe(reportedUrl)
	expect(reportedEvent?.properties.$web_vitals_LCP_event).toMatchObject({
		$current_url: reportedUrl,
		navigationURL: reportedUrl,
	})
	expect(reportedEvent?.properties.$web_vitals_INP_event).toMatchObject({ $current_url: reportedUrl })
	expect(JSON.stringify(reportedEvent)).not.toContain("bffe43c2")
	expect(JSON.stringify(reportedEvent)).not.toContain("secret")
})

// the web vitals start from the app's own chunk, with attribution off and no script loaded from posthog's asset host
test("the web vitals are captured without attribution or an external script", async () => {
	const visitAnalyticsSource = await Bun.file(new URL("./visitAnalytics.ts", import.meta.url)).text()
	expect(visitAnalyticsSource).toContain("capture_performance: { web_vitals: true, web_vitals_attribution: false }")
	expect(visitAnalyticsSource).toContain("disable_external_dependency_loading: true")
	expect(visitAnalyticsSource).toContain('import("posthog-js/dist/web-vitals")')
})

// a token in the page's address, a referrer's query string, and a fragment never leave the browser,
// while the campaign property posthog records on its own stays
test("no url keeps its query string or its fragment", () => {
	const reportedEvent = toReportedEvent({
		event: "$pageview",
		properties: {
			$current_url: "https://carlnotes.com/reset-password?token=secret-reset#form",
			$referrer: "https://news.example.com/item?id=secret-referrer",
			$session_entry_url: "https://carlnotes.com/unsubscribe?token=secret-unsubscribe",
			utm_source: "newsletter",
		},
	} as never)
	expect(reportedEvent?.properties).toEqual({
		$current_url: "https://carlnotes.com/reset-password",
		$referrer: "https://news.example.com/item",
		$session_entry_url: "https://carlnotes.com/unsubscribe",
		utm_source: "newsletter",
	})
})

// an event with nothing to rewrite passes through, so the hook never drops one
test("an event with no url or path is returned unchanged", () => {
	expect(toReportedEvent(null)).toBeNull()
	const plainEvent = { event: "$pageview", properties: {} }
	expect(toReportedEvent(plainEvent as never)).toBe(plainEvent as never)
})

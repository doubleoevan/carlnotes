// visit analytics: how many people open which page, with nothing stored on their device and nobody identified
import posthog, { type CaptureResult } from "posthog-js"

// the routes whose second segment is an id, and the shape each one reports as
const ROUTE_ID_SHAPES: Record<string, string> = {
	topics: ":id",
	profiles: ":userId",
	teams: ":teamId",
	invite: ":token",
}

/**
 * The path as the report names it, with an id segment replaced by its route's shape.
 */
export function toReportedPath(pathname: string): string {
	// read the route and what follows it, leaving a path with neither alone
	const [, route, idSegment, ...restSegments] = pathname.split("/")
	const idShape = route ? ROUTE_ID_SHAPES[route] : undefined
	if (!idShape || !idSegment) {
		return pathname
	}
	return ["", route, idShape, ...restSegments].join("/")
}

/**
 * Starts the visit analytics, or does nothing when no key is set, which is the self-host path.
 */
export function startVisitAnalytics(): void {
	const projectKey = import.meta.env.VITE_POSTHOG_KEY
	if (!projectKey) {
		return
	}
	posthog.init(projectKey, {
		api_host: import.meta.env.VITE_POSTHOG_HOST,
		// every event posthog sends passes through here, including the page leave it captures on its own
		before_send: toReportedEvent,
		// nothing is stored on the visitor's device, so there is no cookie to ask about
		cookieless_mode: "always",
		// cookieless mode does not stop an identification on its own. this makes one a no-op
		person_profiles: "never",
		// a visit is all this collects. no click, keystroke, form value, or recording
		autocapture: false,
		disable_session_recording: true,
		// the router captures each view instead, since one navigation covers the whole visit
		capture_pageview: false,
		// the leave is what gives a session its exit page and its duration
		capture_pageleave: true,
	})
}

/**
 * Every event as it is sent, with each id taken out of the path and the url posthog attaches to all of them.
 */
export function toReportedEvent(capturedEvent: CaptureResult | null): CaptureResult | null {
	if (!capturedEvent?.properties) {
		return capturedEvent
	}
	// the url carries the path a second time, so both are rewritten or the id ships in the one that was missed
	const currentUrl = capturedEvent.properties.$current_url
	if (typeof currentUrl === "string") {
		const reportedUrl = new URL(currentUrl)
		reportedUrl.pathname = toReportedPath(reportedUrl.pathname)
		capturedEvent.properties.$current_url = reportedUrl.toString()
	}
	const pathname = capturedEvent.properties.$pathname
	if (typeof pathname === "string") {
		capturedEvent.properties.$pathname = toReportedPath(pathname)
	}
	return capturedEvent
}

/**
 * Reports one page view. The path it reports is rewritten on the way out, with every other event.
 */
export function captureVisit(): void {
	if (!import.meta.env.VITE_POSTHOG_KEY) {
		return
	}
	posthog.capture("$pageview")
}

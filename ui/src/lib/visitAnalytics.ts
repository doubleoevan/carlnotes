// visit analytics: how many people open which page and what they play, click, and share there, with nothing stored
// on their device and nobody identified
import type { AnalyticsEventProperties, VisitAnalyticsEvent } from "@shared/analytics"
import type { PodcastEpisode } from "@shared/contracts"
import type { visibilities } from "@shared/enums"
import { toReportedPath } from "@shared/reportedPath"
import posthog, { type CaptureResult } from "posthog-js"

// the property of a web vitals event with one metric in it, which repeats the page's url
const WEB_VITALS_METRIC_PATTERN = /^\$web_vitals_\w+_event$/

// a value that reads as an absolute url
const ABSOLUTE_URL_PATTERN = /^https?:\/\//

/**
 * Starts the visit analytics, or does nothing if no key is set, which is the self-host path.
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
		// each page's web vitals, with no element or resource url attached, from code the app bundles itself
		capture_performance: { web_vitals: true, web_vitals_attribution: false },
		disable_external_dependency_loading: true,
	})

	// the web vitals code loads as the app's own chunk after startup, then its capture starts.
	// a chunk that is blocked or gone after a deploy loses only the web vitals
	import("posthog-js/dist/web-vitals").then(() => posthog.webVitalsAutocapture?.startIfEnabled()).catch(() => undefined)
}

/**
 * Returns each event as it is sent, with every id taken out of the paths and urls it includes, with no query string
 * or fragment left on a url: the page's url, which posthog attaches to all of them, the previous page's path,
 * the referrer, and the urls inside each web vitals metric.
 */
export function toReportedEvent(capturedEvent: CaptureResult | null): CaptureResult | null {
	if (!capturedEvent?.properties) {
		return capturedEvent
	}

	// the event's own paths and urls, then each web vitals metric's
	rewritePathsAndUrls(capturedEvent.properties)
	for (const [propertyName, metric] of Object.entries(capturedEvent.properties)) {
		if (WEB_VITALS_METRIC_PATTERN.test(propertyName) && typeof metric === "object" && metric !== null) {
			rewritePathsAndUrls(metric)
		}
	}
	return capturedEvent
}

// replace the id and the slug in every path property and every url of a set of properties,
// and cut each url to its origin and its path, in place
function rewritePathsAndUrls(properties: Record<string, unknown>): void {
	for (const [propertyName, value] of Object.entries(properties)) {
		// a path is named for one, such as $pathname and $prev_pageview_pathname
		if (typeof value === "string" && propertyName.endsWith("pathname")) {
			properties[propertyName] = toReportedPath(value)
		}

		// a url is reported as its origin and its path's shape, so a token in its query string or fragment never leaves
		if (typeof value === "string" && ABSOLUTE_URL_PATTERN.test(value) && URL.canParse(value)) {
			const parsedUrl = new URL(value)
			properties[propertyName] = `${parsedUrl.origin}${toReportedPath(parsedUrl.pathname)}`
		}
	}
}

/**
 * Reports one page view. The path it reports is rewritten with every other event's.
 */
export function captureVisit(): void {
	if (!import.meta.env.VITE_POSTHOG_KEY) {
		return
	}
	posthog.capture("$pageview")
}

/**
 * Reports one visit event by name. A no-op if VITE_POSTHOG_KEY is not set.
 */
export function captureVisitEvent(event: VisitAnalyticsEvent, properties: AnalyticsEventProperties = {}): void {
	if (!import.meta.env.VITE_POSTHOG_KEY) {
		return
	}
	posthog.capture(event, properties)
}

/**
 * The topic a visit event names: a public topic by its id, and any other topic not at all.
 */
export function toPublicTopicProperties(topic: {
	id: string
	visibility: (typeof visibilities)[number]
}): AnalyticsEventProperties {
	return topic.visibility === "public" ? { topicId: topic.id } : {}
}

/**
 * Reports a play or a finish of an episode, naming the episode and its topic only if the topic is public.
 */
export function captureEpisodeVisitEvent(
	event: "visit_episode_played" | "visit_episode_completed",
	podcastEpisode: PodcastEpisode,
): void {
	captureVisitEvent(
		event,
		podcastEpisode.topicVisibility === "public"
			? { episodeId: podcastEpisode.id, topicId: podcastEpisode.topicId }
			: {},
	)
}

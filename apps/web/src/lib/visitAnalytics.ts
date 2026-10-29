// visit analytics: how many people open which page and what they play, click, and share there, with nothing stored
// on their device and nobody identified
import type { AnalyticsEventProperties, VisitAnalyticsEvent } from "@carlnotes/contracts/analyticsEvents"
import { toClientTelemetry } from "@carlnotes/contracts/clientTelemetry"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	toPublicPodcastEpisodeProperties,
	toReportedEvent as toReportedVisitEvent,
} from "@carlnotes/contracts/visitAnalytics"
import posthog, { type CaptureResult } from "posthog-js"

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

	// attach the same platform dimensions as server and native events
	posthog.register({
		...toClientTelemetry((name) => (name === "user-agent" ? navigator.userAgent : null)),
		environment: import.meta.env.DEV ? "development" : "production",
	})

	// the web vitals code loads as the app's own chunk after startup, then its capture starts.
	// a chunk that is blocked or gone after a deploy loses only the web vitals
	import("posthog-js/dist/web-vitals").then(() => posthog.webVitalsAutocapture?.startIfEnabled()).catch(() => undefined)
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
 * Reports a play or a finish of an episode, naming the episode and its topic only if the topic is public.
 */
export function captureEpisodeVisitEvent(
	event: "visit_episode_played" | "visit_episode_completed",
	podcastEpisode: PodcastEpisode,
): void {
	captureVisitEvent(event, toPublicPodcastEpisodeProperties(podcastEpisode))
}

// share the privacy policy with native visit analytics
export { toPublicTopicProperties } from "@carlnotes/contracts/visitAnalytics"

/** Redacts SDK events using the shared visit privacy policy. */
export const toReportedEvent: (event: CaptureResult | null) => CaptureResult | null = toReportedVisitEvent

// product analytics, imported by the api and the worker. off unless POSTHOG_API_KEY is set
import { PostHog } from "posthog-node"

export type AnalyticsEvent =
	// the signup funnel, ending at the activation milestone
	| "signup_completed"
	| "topic_created"
	| "first_scan_completed"
	// what the owner asks the product to do, and the paywall they hit when asking for more
	| "scan_requested"
	| "scan_quota_reached"
	// engagement, which fires every time instead of only the first time
	| "finding_rated"
	| "finding_bookmarked"
	| "finding_unbookmarked"
	| "finding_read"
	| "finding_unread"
	| "finding_opened"
	// conversation about a topic, and the paywall a reader hits when their month's budget is spent
	| "chat_turn_sent"
	| "chat_budget_reached"

/**
 * Records one product event for a user. A no-op if `POSTHOG_API_KEY` isn't set.
 * Properties are short identifiers only, since event history cannot be backfilled.
 */
export function trackEvent(event: AnalyticsEvent, userId: string, properties?: Record<string, string>): void {
	// a send failure must never surface to the caller. the event is telemetry, not work
	try {
		analyticsClient()?.capture({ distinctId: userId, event, properties })
	} catch (error) {
		console.error(`analytics capture failed for ${event}`, error)
	}
}

// an iPad running iPadOS reports itself as a Mac, so it counts as desktop here, the same way it renders
const MOBILE_USER_AGENT_PATTERN = /Mobi|Android|iPhone|iPod|IEMobile/i

/**
 * Which kind of device a request came from. Only meaningful for events that a browser triggered.
 */
export function toPlatform(userAgent: string | null | undefined): "mobile" | "desktop" {
	return userAgent && MOBILE_USER_AGENT_PATTERN.test(userAgent) ? "mobile" : "desktop"
}

// the analytics client, built on first use. null means no key, so analytics never starts
let analytics: PostHog | null = null
let isAnalyticsResolved = false

// the analytics client on demand, built once. a missing key leaves it null forever
function analyticsClient(): PostHog | null {
	if (!isAnalyticsResolved) {
		isAnalyticsResolved = true
		const apiKey = Bun.env.POSTHOG_API_KEY
		analytics = apiKey ? new PostHog(apiKey, { host: Bun.env.POSTHOG_HOST }) : null
	}
	return analytics
}

/**
 * Flushes pending events before a short-lived process exits. Safe to call whether or not analytics started.
 */
export async function shutdownAnalytics(): Promise<void> {
	// a flush failure must never flip the outcome the run earned
	try {
		await analytics?.shutdown()
	} catch (error) {
		console.error("analytics shutdown failed", error)
	}
}

// product analytics, imported by the api and the worker. off unless POSTHOG_API_KEY is set
import { PostHog } from "posthog-node"

export type AnalyticsEvent =
	// the signup funnel, ending at the activation milestone, and the account closing that undoes it
	| "signup_completed"
	| "account_deleted"
	| "topic_created"
	// what happened to a topic after it was saved, and whether its owner is who did it
	| "topic_updated"
	| "topic_deleted"
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
	// conversation about a topic, and the paywall a user hits when their month's budget is spent
	| "chat_turn_sent"
	| "chat_budget_reached"

/**
 * Records one product event for a user. A no-op if `POSTHOG_API_KEY` isn't set.
 * Properties are short identifiers only, since event history cannot be backfilled.
 */
export function trackEvent(
	event: AnalyticsEvent,
	userId: string,
	properties?: Record<string, string | number | boolean>,
): void {
	// a send failure must never surface to the caller. the event is telemetry, not work
	try {
		analyticsClient()?.capture({ distinctId: userId, event, properties })
	} catch (error) {
		console.error(`analytics capture failed for ${event}`, error)
	}
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

// product analytics: a user's event keyed to the user id, a bot's or an app's keyed to its name, and the browser's
// anonymous visit. off unless POSTHOG_API_KEY is set
import type {
	AnalyticsEventProperties,
	BotAnalyticsEvent,
	UserAnalyticsEvent,
} from "@carlnotes/contracts/analyticsEvents"
import { PostHog } from "posthog-node"

/**
 * Records one product event for a user. A no-op if `POSTHOG_API_KEY` isn't set.
 * Properties are short identifiers only. Event history cannot be backfilled.
 */
export function trackEvent(event: UserAnalyticsEvent, userId: string, properties?: AnalyticsEventProperties): void {
	// a send failure must never surface to the caller. the event is telemetry, not work
	try {
		analyticsClient()?.capture({ distinctId: userId, event, properties })
	} catch (error) {
		console.error(`analytics capture failed for ${event}`, error)
	}
}

/**
 * Records one event for a bot or an app, keyed to its name. The capture never creates a person profile.
 */
export function trackBotEvent(event: BotAnalyticsEvent, botName: string, properties?: AnalyticsEventProperties): void {
	// a send failure must never surface to the caller. the event is telemetry, not work
	try {
		analyticsClient()?.capture(toBotCapture(event, botName, properties))
	} catch (error) {
		console.error(`analytics capture failed for ${event}`, error)
	}
}

// a bot event's capture: the bot's name as its distinct id, the event, and its properties
type BotCapture = { distinctId: string; event: BotAnalyticsEvent; properties: AnalyticsEventProperties }

/**
 * The capture a bot event sends, with `$process_person_profile` false beside the event's own properties.
 */
export function toBotCapture(
	event: BotAnalyticsEvent,
	botName: string,
	properties?: AnalyticsEventProperties,
): BotCapture {
	return { distinctId: botName, event, properties: { ...properties, $process_person_profile: false } }
}

// the analytics client, built on first use. null means no key, so analytics never starts
let analytics: PostHog | null | undefined

// the analytics client on demand, built once. a missing key leaves it null forever
function analyticsClient(): PostHog | null {
	if (analytics === undefined) {
		const apiKey = Bun.env.POSTHOG_API_KEY
		analytics = apiKey ? new PostHog(apiKey, { host: Bun.env.POSTHOG_HOST }) : null
	}
	return analytics
}

/**
 * Flushes pending events before a short-lived process exits. Safe to call whether or not analytics started.
 */
export async function shutdownAnalytics(): Promise<void> {
	// a flush failure must never change the analytics run's result
	try {
		await analytics?.shutdown()
	} catch (error) {
		console.error("analytics shutdown failed", error)
	}
}

// product analytics, imported by the api and the worker, and by the ui's visit analytics for its event names.
// three kinds of event: a user's keyed to the user id, a bot's or an app's keyed to its name, and the browser's
// anonymous visit. off unless POSTHOG_API_KEY is set
import { PostHog } from "posthog-node"

// where a server event came from
export type AnalyticsEntryPoint = "web" | "mcp" | "email" | "feed" | "worker" | "webhook"

// an event's properties: short identifiers, numbers, and flags, never content
export type AnalyticsEventProperties = Record<string, string | number | boolean>

export type UserAnalyticsEvent =
	// the account: the signup funnel's start, each sign-in, and the account closing that undoes it
	| "signup_completed"
	| "login_completed"
	| "account_deleted"
	// billing: the checkout a user opens, and what the payment provider reports back
	| "checkout_started"
	| "subscription_started"
	| "plan_changed"
	| "subscription_canceled"
	| "topic_created"
	// what happened to a topic after it was saved, and whether its owner is who did it
	| "topic_updated"
	| "topic_deleted"
	| "podcast_toggled"
	// a topic's sources and attachments, from the form and the tools alike
	| "source_added"
	| "source_removed"
	| "attachment_added"
	| "sources_suggested"
	// what the owner asks the product to do, the paywall they hit when asking for more, and what every scan did
	| "scan_requested"
	| "scan_quota_reached"
	| "scan_completed"
	| "scan_stopped"
	| "first_scan_completed"
	// sharing a topic or a team, tagged by the path that created the invite, and what the invitee did with it
	| "invite_created"
	| "invite_reused"
	| "invite_accepted"
	| "invite_declined"
	// engagement, which fires every time instead of only the first time
	| "finding_rated"
	| "finding_bookmarked"
	| "finding_unbookmarked"
	| "finding_read"
	| "finding_unread"
	| "finding_opened"
	| "finding_feedback_sent"
	// following a topic, and the emails that come with it
	| "topic_subscribed"
	| "topic_unsubscribed"
	| "email_digest_toggled"
	| "email_unsubscribed"
	// listening, in the app or through a listener's feed, and the feed itself
	| "episode_played"
	| "episode_completed"
	| "podcast_feed_added"
	| "podcast_feed_reset"
	// conversation about a topic, the paywall a user hits when their month's budget is spent, and a room's messages
	| "chat_turn_sent"
	| "chat_budget_reached"
	| "room_message_sent"
	// a topic edited through a topic tool, tagged by the tool and its origin
	| "topic_edited"
	// a team's life: its creation, its members, its topics, and its end
	| "team_created"
	| "team_deleted"
	| "team_join_requested"
	| "team_join_approved"
	| "team_member_removed"
	| "team_topic_added"
	| "team_topic_removed"
	// notes and their comment threads
	| "note_created"
	| "note_comment_added"
	| "note_thread_resolved"
	// a report of someone's content
	| "content_flagged"

// the events keyed to a bot's or an app's name
export type BotAnalyticsEvent =
	// an AI app connecting and calling tools
	| "mcp_connected"
	| "mcp_tool_called"
	// a crawler reading a page, an unfurler fetching a link's card, and a podcast app or a feed reader pulling a feed
	| "crawler_fetched"
	| "link_unfurled"
	| "feed_fetched"

// the events the browser sends for an anonymous visit, each named with a visit_ prefix
export type VisitAnalyticsEvent =
	| "visit_topic_viewed"
	| "visit_episode_played"
	| "visit_episode_completed"
	| "visit_finding_clicked"
	| "visit_cta_clicked"
	| "visit_share_clicked"
	| "visit_podcast_subscribe_clicked"

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
	// a flush failure must never change the analytics run's result
	try {
		await analytics?.shutdown()
	} catch (error) {
		console.error("analytics shutdown failed", error)
	}
}

// the product analytics events: where a server event came from, an event's properties, and the names of the user,
// bot, and visit events that the server records and the browser sends

// where a server event came from
export type AnalyticsEntryPoint = "web" | "mobile" | "mcp" | "email" | "feed" | "worker" | "webhook"

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
	// conversation about a topic, the paywall a user hits when their month's budget is spent, a room's messages,
	// a spoken question with its timings, and a play tap on a reply
	| "chat_turn_sent"
	| "chat_budget_reached"
	| "room_message_sent"
	| "spoken_question_sent"
	| "spoken_answer_played"
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
	// notes and their comments
	| "note_created"
	| "note_comment_added"
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

// the events the server records for a visitor with no account yet
export type VisitorAnalyticsEvent =
	// an app install whose attestation the signup gate rejected, by platform and reason
	"signup_gate_rejected"

// the events the browser sends for an anonymous visit, each named with a visit_ prefix
export type VisitAnalyticsEvent =
	// a topic page view and a listen on it
	| "visit_topic_viewed"
	| "visit_episode_played"
	| "visit_episode_completed"
	// a visitor's clicks: a finding, a call to action, a share, a podcast subscribe, and a video play
	| "visit_finding_clicked"
	| "visit_cta_clicked"
	| "visit_share_clicked"
	| "visit_podcast_subscribe_clicked"
	| "visit_video_played"

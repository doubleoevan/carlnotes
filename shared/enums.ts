// the one shared set of enum values. db builds its pgEnums from these, api validates with them, and ui renders with them
export const sourceKinds = [
	"url",
	"rss",
	"reddit",
	"youtube",
	"podcast",
	"search",
	"bluesky",
	"x",
	"composio",
	"plugin",
] as const
export const resourceKinds = ["read", "watch", "listen"] as const
export const visibilities = ["public", "invite", "private"] as const
// how many findings a public topic needs before it is shown to others
export const MINIMUM_SHOWN_FINDINGS = 3
export const frequencies = ["daily", "weekdays", "weekly"] as const
// the frequencies the plan's daily topic limit applies to
export const dailyFrequencies = ["daily", "weekdays"] as const

/**
 * Whether the frequency is one the plan's daily topic limit applies to.
 */
export function isDailyFrequency(frequency: string): boolean {
	return dailyFrequencies.includes(frequency as (typeof dailyFrequencies)[number])
}

// the day a weekly scan runs on. ignored for non-weekly frequencies
export const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const
export const scanStatuses = ["running", "succeeded", "failed"] as const
// an attachment's async processing status: pending === stored and queued, ready === processed, or failed
export const attachmentStatuses = ["pending", "ready", "failed"] as const
// what a kept chat attachment originally was, shared by the db enum and the chat payload's zod schema
export const chatAttachmentKinds = ["image", "pdf", "document", "text", "video"] as const
export const sourceVisibilities = ["public", "private"] as const
export const ratings = ["up", "down"] as const
// the keys for the homepage's topic feed sections. yours and subscribed require a signed-in visitor
export const topicSectionKeys = ["yours", "subscribed", "featured", "popular"] as const
// the source kinds a user can add from the topic editor. composio and plugin sources will be custom instead of default
export const editableSourceKinds = ["url", "rss", "reddit", "youtube", "podcast", "search", "bluesky", "x"] as const
// what a team member may do. a leader manages the team, a member edits its topics and chats
export const teamRoles = ["leader", "member"] as const
// who may send an invite to a user: everyone, only connected senders, or nobody at all
export const inviteAccesses = ["anyone", "connected", "nobody"] as const
// the billing plans. every user starts on free
export const plans = ["free", "plus", "premium"] as const
// how often a subscription bills
export const billingIntervals = ["monthly", "yearly"] as const
// where a user's public avatar comes from. generated uses the username initials
export const avatarSources = ["generated", "oauth", "upload"] as const
// how many findings a topic scan may keep
export const maxResultsOptions = [5, 10, 15, 20] as const
// who may see a note: its owner alone, the page's team, or everyone
export const noteVisibilities = ["private", "team", "public"] as const

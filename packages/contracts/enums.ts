// the one shared set of enum values. db builds its pgEnums from these, api validates with them, and ui renders with
// them

// the case a display enum takes on the app when the api sends a value this version does not know
export const UNKNOWN_CASE = "unknown"
export type UnknownCase = typeof UNKNOWN_CASE

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
export type Frequency = (typeof frequencies)[number]

/**
 * Returns a frequency the editor can offer: the value itself, or weekly for an unknown value.
 */
export function toKnownFrequency(frequency: string): Frequency {
	return toKnownValue(frequencies, frequency, "weekly")
}
// the frequencies the plan's daily topic limit applies to
export const dailyFrequencies = ["daily", "weekdays"] as const

/**
 * Every schedule a scan can run on, as one sentence fragment with "or" before the last. Prompts fill this in
 * instead of listing the frequencies themselves, so adding one reaches every prompt that names them.
 */
export function toScanFrequenciesSentence(): string {
	return toOrSentence(frequencies)
}

/**
 * Every visibility a topic can have, as one sentence fragment with "or" before the last, for the prompts that name
 * them.
 */
export function toVisibilitiesSentence(): string {
	return toOrSentence(visibilities)
}

/**
 * Every count of findings a scan can keep, as one sentence fragment with "or" before the last, for the prompts that
 * name them.
 */
export function toMaxTopicFindingsSentence(): string {
	return toOrSentence(maxTopicFindingsOptions)
}

// a list as one sentence fragment, with "or" before the last value
function toOrSentence(values: readonly (string | number)[]): string {
	return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`
}

/**
 * Whether the frequency is one the plan's daily topic limit applies to.
 */
export function isDailyFrequency(frequency: string): boolean {
	return dailyFrequencies.includes(frequency as (typeof dailyFrequencies)[number])
}

// the day a weekly scan runs on. ignored for non-weekly frequencies
export const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const
export type DayOfWeek = (typeof daysOfWeek)[number]

/**
 * Returns a day the editor can offer: the value itself, or monday for an unknown value.
 */
export function toKnownDayOfWeek(dayOfWeek: string): DayOfWeek {
	return toKnownValue(daysOfWeek, dayOfWeek, "monday")
}

// the value if the list names it, else the fallback
function toKnownValue<Value extends string>(values: readonly Value[], value: string, fallback: Value): Value {
	return values.includes(value as Value) ? (value as Value) : fallback
}
export const scanStatuses = ["running", "succeeded", "failed"] as const
// a podcast episode's status. recording until it publishes or fails,
// and removed once its topic's owner or an admin removes it
export const podcastEpisodeStatuses = ["recording", "published", "failed", "removed"] as const
// who speaks a turn of a podcast episode, and who answers a question asked from the podcast player
export const podcastEpisodeSpeakers = ["host", "cohost"] as const
export type PodcastEpisodeSpeaker = (typeof podcastEpisodeSpeakers)[number]

/**
 * Returns whether a value is one of the two podcast episode speakers.
 */
export function isPodcastEpisodeSpeaker(value: unknown): value is PodcastEpisodeSpeaker {
	return podcastEpisodeSpeakers.some((podcastEpisodeSpeaker) => podcastEpisodeSpeaker === value)
}

// what a chat turn row records: a private chat turn, a podcast chat turn, carl's chat room turn, or a transcription's
// or a spoken part's spend
export const chatTurnKinds = ["private", "podcast", "chat_room", "transcription", "speech"] as const
export type ChatTurnKind = (typeof chatTurnKinds)[number]
// the chat turn kinds a topic's conversation holds, and where a spoken question can be asked from: the chat or the
// podcast player
export const conversationChatTurnKinds = ["private", "podcast"] as const satisfies readonly ChatTurnKind[]
export type ConversationChatTurnKind = (typeof conversationChatTurnKinds)[number]
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

/**
 * Whether a stored platform role grants admin authority.
 */
export function isAdminRole(role: string | null | undefined): boolean {
	// the one place this role decides authority. it stays plain text to match Better Auth's admin plugin shape
	return role === "admin"
}

/**
 * Whether a team membership role is the leader's.
 */
export function isLeaderRole(role: string | null | undefined): boolean {
	return role === "leader"
}

/**
 * Whether a plan is paid.
 */
export function isPaidPlan(plan: string | null | undefined): plan is Exclude<(typeof plans)[number], "free"> {
	return Boolean(plan) && plan !== "free"
}

/**
 * Whether a plan is the premium one.
 */
export function isPremiumPlan(plan: string | null | undefined): boolean {
	return plan === "premium"
}
// who may send an invite to a user: everyone, only connected senders, or nobody at all
export const inviteAccesses = ["anyone", "connected", "nobody"] as const
// the billing plans. every user starts on free
export const plans = ["free", "plus", "premium"] as const
// how often a subscription bills
export const billingIntervals = ["monthly", "yearly"] as const
// where a user's public avatar comes from. generated uses the username initials
export const avatarSources = ["generated", "oauth", "upload"] as const
// how many findings a topic scan may keep
export const maxTopicFindingsOptions = [5, 10, 15, 20] as const
// who may see a note: its owner alone, the page's team, or everyone
export const noteVisibilities = ["private", "team", "public"] as const
// where a prompt version comes from: the topic editor, a chat tool, or an MCP tool
export const promptVersionOrigins = ["editor", "chat", "mcp"] as const
// what a report names: a Topic, a profile, a Team, a chat room message, a note, or a note comment
export const reportSubjectKinds = ["topic", "profile", "team", "chatMessage", "note", "noteComment"] as const
// how an admin closes a report: the content was removed, or kept
export const reportResolutions = ["removed", "kept"] as const

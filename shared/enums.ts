// the canonical enum value sets. db builds its pgEnums from these, api validates with them, and ui renders with them
export const sourceKinds = ["url", "rss", "reddit", "youtube", "search", "composio", "plugin"] as const
export const resourceKinds = ["read", "watch", "listen"] as const
export const visibilities = ["public", "invite", "private"] as const
export const frequencies = ["daily", "weekdays", "weekly"] as const
// the frequencies that the plan's daily topic limit caps
export const dailyFrequencies = ["daily", "weekdays"] as const

/**
 * Whether a frequency is considered daily
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
export const chatAttachmentKinds = ["image", "pdf", "text"] as const
export const sourceVisibilities = ["public", "private"] as const
export const ratings = ["up", "down"] as const
// the keys for the homepage's topic feed sections. yours and subscribed required a signed-in visitor
export const topicSectionKeys = ["yours", "subscribed", "featured", "popular"] as const
// the source kinds a user can add from the topic editor. composio and plugin sources will be custom instead of default
export const editableSourceKinds = ["url", "rss", "reddit", "youtube", "search"] as const
// the billing plans. every user starts on free
export const plans = ["free", "plus", "premium"] as const
// how often a subscription bills. a plan's limits differ by monthly or yearly billing interval, and only a monthly one supports metered overage
export const billingIntervals = ["monthly", "yearly"] as const
// how many findings a topic scan may keep
export const maxResultsOptions = [5, 10, 15, 20] as const

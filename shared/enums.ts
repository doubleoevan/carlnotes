// the canonical enum value sets. db builds its pgEnums from these, api validates with them, and ui renders with them
export const sourceKinds = ["rss", "reddit", "youtube", "search", "composio", "plugin"] as const
export const resourceKinds = ["read", "watch", "listen"] as const
export const visibilities = ["public", "invite", "private"] as const
export const frequencies = ["daily", "weekly"] as const
export const scanStatuses = ["running", "succeeded", "failed"] as const
export const sourceVisibilities = ["public", "private"] as const
export const ratings = ["up", "down"] as const
// the keys for the homepage's three topic feed sections
export const topicSectionKeys = ["yours", "featured", "popular"] as const

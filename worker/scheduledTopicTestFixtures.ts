// the scheduled Topic builder that the schedule and scheduled topic limit tests share
import type { topics } from "../db/schema/topics"

/**
 * Returns a scheduled weekly Topic with only the fields that startScheduledTopicScans reads.
 * The daily topic limit never skips a weekly Topic.
 */
export function toScheduledTopic(id: string, ownerId = "owner-1"): typeof topics.$inferSelect {
	return { id, ownerId, frequency: "weekly" } as never
}

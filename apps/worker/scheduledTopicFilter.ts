// the filter that selects the Topics scheduled for a Scan, and the frequency window it waits between Scans

import type { Frequency } from "@carlnotes/contracts/enums"
import { DAY_MS, isUtcWeekend } from "@carlnotes/contracts/time"
import { scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { and, eq, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm"

/**
 * Returns the filter that selects the Topics scheduled for a Scan now.
 * A Topic is scheduled if it has no completed Scan, or if its last completed Scan is older than its frequency window.
 * A failed Scan counts as completed.
 * A scanned weekdays Topic is never scheduled on a UTC weekend.
 */
export function toScheduledTopicFilter(now: Date): SQL | undefined {
	// the start of each Topic's last completed Scan. a running Scan never spends the frequency window, and neither does
	// a failed Scan that was handed to Temporal but never picked up
	const lastCompletedScanStartedAt = sql`(select max(${scans.startedAt}) from ${scans} where ${scans.topicId} = ${topics.id} and ${scans.status} <> 'running' and not (${scans.status} = 'failed' and ${scans.dispatchedAt} is not null and ${scans.pickedUpAt} is null))`

	// select a Topic never scanned or last scanned longer ago than its frequency window.
	// a scanned weekdays Topic skips the weekend
	const scheduledDailyFrequencies = isUtcWeekend(now) ? ["daily" as const] : ["daily" as const, "weekdays" as const]
	return or(
		isNull(lastCompletedScanStartedAt),
		and(
			eq(topics.frequency, "weekly"),
			lt(lastCompletedScanStartedAt, new Date(now.getTime() - frequencyWindowMs("weekly"))),
		),
		and(
			inArray(topics.frequency, scheduledDailyFrequencies),
			lt(lastCompletedScanStartedAt, new Date(now.getTime() - frequencyWindowMs("daily"))),
		),
	)
}

// how long a Topic's frequency keeps it from re-scanning. daily and weekdays rescan after a day, weekly after a week
export function frequencyWindowMs(frequency: Frequency): number {
	return frequency === "weekly" ? 7 * DAY_MS : DAY_MS
}

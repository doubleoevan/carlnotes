// scheduled topic filter tests: the frequency window, the scheduled topic filter in sql, and the daily topic limit
import { expect, test } from "bun:test"
import { DAY_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { frequencyWindowMs, toScheduledTopicFilter } from "./schedule"
import { isWithinDailyTopicLimit } from "./scheduledTopicLimits"

// the sql and the parameters that a select of the scheduled Topics renders on a given day
function toScheduledTopicQuery(now: Date): { sql: string; params: unknown[] } {
	return db.select({ id: topics.id }).from(topics).where(toScheduledTopicFilter(now)).toSQL()
}

// the daily frequency waits a day before a re-scan, the weekly frequency waits seven
test("frequencyWindowMs is a day for daily and a week for weekly", () => {
	expect(frequencyWindowMs("daily")).toBe(DAY_MS)
	expect(frequencyWindowMs("weekly")).toBe(7 * DAY_MS)
})

// the scheduled topic filter is one sql predicate.
// a topic is scheduled if it has no completed scan, or if its last completed scan is older than its frequency window
test("the scheduled topic filter reads the last completed scan in sql with the day and week windows", () => {
	// a wednesday, so daily and weekdays both read the day window
	const now = new Date("2026-07-22T12:00:00Z")
	const { sql, params } = toScheduledTopicQuery(now)

	// the subquery over completed scans, and the null branch for a topic never scanned.
	// a failed scan that was dispatched and never picked up failed without running, so it spends no window
	expect(sql).toContain('max("scans"."started_at")')
	expect(sql).toContain("<> 'running'")
	expect(sql).toContain("is null")
	expect(sql).toContain(
		`not ("scans"."status" = 'failed' and "scans"."dispatched_at" is not null and "scans"."picked_up_at" is null)`,
	)

	// the weekly branch reads a week back and the daily branch a day back, for daily and weekdays alike
	expect(params).toEqual([
		"weekly",
		new Date(now.getTime() - 7 * DAY_MS),
		"daily",
		"weekdays",
		new Date(now.getTime() - DAY_MS),
	])
})

// a scanned weekdays topic drops out of the day window on a weekend and comes back on monday
test("the scheduled topic filter drops a scanned weekdays topic on a weekend", () => {
	// a saturday leaves only daily in the day window's frequencies
	const saturday = new Date("2026-07-25T12:00:00Z")
	expect(toScheduledTopicQuery(saturday).params).toEqual([
		"weekly",
		new Date(saturday.getTime() - 7 * DAY_MS),
		"daily",
		new Date(saturday.getTime() - DAY_MS),
	])

	// monday puts weekdays back in the day window
	const monday = new Date("2026-07-27T12:00:00Z")
	expect(toScheduledTopicQuery(monday).params).toContain("weekdays")
})

// the daily topic limit binds the Topics already there, not only the ones being written
test("the sweep runs only the daily Topics inside their owner's allowance", () => {
	const allowance = new Set(["kept"])

	// a daily Topic inside the allowance runs, and one outside it is skipped
	expect(isWithinDailyTopicLimit({ id: "kept", frequency: "daily" }, allowance)).toBe(true)
	expect(isWithinDailyTopicLimit({ id: "dropped", frequency: "daily" }, allowance)).toBe(false)

	// weekdays draws on the same allowance as daily, or it would be a free way around the limit
	expect(isWithinDailyTopicLimit({ id: "dropped", frequency: "weekdays" }, allowance)).toBe(false)
	expect(isWithinDailyTopicLimit({ id: "kept", frequency: "weekdays" }, allowance)).toBe(true)

	// a weekly Topic draws on no daily allowance, so the limit never reaches it
	expect(isWithinDailyTopicLimit({ id: "dropped", frequency: "weekly" }, allowance)).toBe(true)
	expect(isWithinDailyTopicLimit({ id: "dropped", frequency: "weekly" }, undefined)).toBe(true)

	// an owner with no daily Topics in this sweep has no allowance read, and no daily Topic to run either
	expect(isWithinDailyTopicLimit({ id: "kept", frequency: "daily" }, undefined)).toBe(false)
})

// schedule tests for frequency, scheduling, taking, and topic sweep summary decisions
import { expect, test } from "bun:test"
import {
	frequencyWindowMs,
	isTopicScheduled,
	isWithinDailyTopicLimit,
	staleScanWindowMs,
	type TopicSweepSummary,
	toExclusiveTask,
} from "./schedule"
import {
	FINISH_ATTEMPTS,
	FINISH_TIMEOUT_MS,
	FINISH_TOTAL_TIMEOUT_MS,
	INGEST_ATTEMPTS,
	INGEST_TIMEOUT_MS,
	INGEST_TOTAL_TIMEOUT_MS,
	MAX_SCAN_DURATION_MS,
	REVIEW_ATTEMPTS,
	REVIEW_TIMEOUT_MS,
	REVIEW_TOTAL_TIMEOUT_MS,
} from "./workflows/stage-timeouts"

// a promise the test resolves on its own schedule, plus the resolver, so a wrapped task can be kept open deliberately
function toDeferredTask<Value>(): { promise: Promise<Value>; resolve: (value: Value) => void } {
	let resolve!: (value: Value) => void
	const promise = new Promise<Value>((resolved) => {
		resolve = resolved
	})
	return { promise, resolve }
}

// a fresh zeroed topic sweep summary to fold outcomes into
function emptyTopicSweepSummary(): TopicSweepSummary {
	return { scheduled: 1, started: 0, skippedOverQuota: 0, skippedOverDailyLimit: 0, failed: 0 }
}

// the daily frequency waits a day before a re-scan, the weekly frequency waits seven
test("frequencyWindowMs is a day for daily and a week for weekly", () => {
	const day = 24 * 60 * 60 * 1000
	expect(frequencyWindowMs("daily")).toBe(day)
	expect(frequencyWindowMs("weekly")).toBe(7 * day)
})

// a Topic is scheduled when it has never scanned or its last scan is older than the frequency window
test("isTopicScheduled gates on the frequency window", () => {
	const now = new Date("2026-07-24T12:00:00Z")
	// a Topic that has never scanned is always scheduled
	expect(isTopicScheduled({ frequency: "daily" }, undefined, now)).toBe(true)
	// a daily Topic scanned an hour ago is not scheduled, two days ago is
	expect(isTopicScheduled({ frequency: "daily" }, new Date("2026-07-24T11:00:00Z"), now)).toBe(false)
	expect(isTopicScheduled({ frequency: "daily" }, new Date("2026-07-22T12:00:00Z"), now)).toBe(true)
	// a weekly Topic scanned six days ago is not scheduled yet
	expect(isTopicScheduled({ frequency: "weekly" }, new Date("2026-07-18T12:00:00Z"), now)).toBe(false)
})

// a failed scan spends the frequency window like any other
test("isTopicScheduled holds a Topic back after a failed scan until the window elapses", () => {
	const now = new Date("2026-07-24T12:00:00Z")
	// a daily Topic whose scan failed an hour ago should not get scheduled again yet
	expect(isTopicScheduled({ frequency: "daily" }, new Date("2026-07-24T11:00:00Z"), now)).toBe(false)
	// once a full day has passed, the Topic is scheduled again
	expect(isTopicScheduled({ frequency: "daily" }, new Date("2026-07-23T11:00:00Z"), now)).toBe(true)
})

// a weekdays Topic shares daily's window but never fires on a weekend, even once the window has elapsed
test("isTopicScheduled holds a weekdays Topic back on a weekend", () => {
	// last scanned Thursday, so the daily window elapses by Friday
	const lastScan = new Date("2026-07-23T12:00:00Z")
	expect(isTopicScheduled({ frequency: "weekdays" }, lastScan, new Date("2026-07-24T12:00:00Z"))).toBe(true)
	// Saturday and Sunday stay held back even though the window keeps growing
	expect(isTopicScheduled({ frequency: "weekdays" }, lastScan, new Date("2026-07-25T12:00:00Z"))).toBe(false)
	expect(isTopicScheduled({ frequency: "weekdays" }, lastScan, new Date("2026-07-26T12:00:00Z"))).toBe(false)
	// topic scan is due again on Monday
	expect(isTopicScheduled({ frequency: "weekdays" }, lastScan, new Date("2026-07-27T12:00:00Z"))).toBe(true)
})

// a Topic's first scan outranks the weekend rule, so a weekdays Topic created on a Saturday is not left empty until Monday
test("isTopicScheduled still schedules a new weekdays Topic on a weekend", () => {
	expect(isTopicScheduled({ frequency: "weekdays" }, undefined, new Date("2026-07-25T12:00:00Z"))).toBe(true)
})

// a running Scan never spends the window: isTopicScheduled reads completed Scans only
test("isTopicScheduled treats a topic with only a pending running scan as due", () => {
	const now = new Date("2026-07-24T12:00:00Z")
	expect(isTopicScheduled({ frequency: "daily" }, undefined, now)).toBe(true)
})

// a call made while the wrapped task is still running is skipped, instead of overlapping it
test("toExclusiveTask skips a call made while the previous call is still running", async () => {
	const deferredTask = toDeferredTask<string>()
	let callCount = 0
	const exclusiveTask = toExclusiveTask(() => {
		callCount++
		return deferredTask.promise
	})

	// the first call starts the task and is still waiting for it when the second call arrives
	const firstCall = exclusiveTask()
	const secondCall = await exclusiveTask()
	expect(secondCall).toBeNull()
	expect(callCount).toBe(1)

	// releasing the first call lets a later call through again
	deferredTask.resolve("done")
	expect(await firstCall).toBe("done")
	expect(await exclusiveTask()).not.toBeNull()
	expect(callCount).toBe(2)
})

// the sweep hands each Scan to Temporal and does not wait, so its summary count starts
test("a topic sweep summary counts starts instead of outcomes", () => {
	const summary = emptyTopicSweepSummary()
	expect(Object.keys(summary).sort()).toEqual([
		"failed",
		"scheduled",
		"skippedOverDailyLimit",
		"skippedOverQuota",
		"started",
	])
})

// the stale scan window waits out the longest a Scan may legally run
test("the stale scan window clears the longest a Scan may legally run", () => {
	// each stage's total covers its own retries, so the summed total cannot fall behind a retry policy that changes
	expect(INGEST_TOTAL_TIMEOUT_MS).toBe(INGEST_TIMEOUT_MS * INGEST_ATTEMPTS)
	expect(REVIEW_TOTAL_TIMEOUT_MS).toBe(REVIEW_TIMEOUT_MS * REVIEW_ATTEMPTS)
	expect(FINISH_TOTAL_TIMEOUT_MS).toBe(FINISH_TIMEOUT_MS * FINISH_ATTEMPTS)

	// the window clears the across-attempts total, not the sum of one attempt per stage
	expect(MAX_SCAN_DURATION_MS).toBe(INGEST_TOTAL_TIMEOUT_MS + REVIEW_TOTAL_TIMEOUT_MS + FINISH_TOTAL_TIMEOUT_MS)
	expect(staleScanWindowMs()).toBeGreaterThan(MAX_SCAN_DURATION_MS)
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

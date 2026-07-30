// schedule tests for frequency, scheduling, claim, and topic sweep summary decisions
import { expect, test } from "bun:test"
import {
	frequencyWindowMs,
	isTopicScheduled,
	type TopicSweepSummary,
	toExclusiveTask,
	trackSweepOutcome,
} from "./schedule"

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
	return { scheduled: 1, scanned: 0, skippedOverQuota: 0, failed: 0 }
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

// a failed scan spends the frequency window like any other,
// so a Topic whose sources keep failing waits its turn instead of being picked up by every sweep.
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

// the first brew outranks the weekend rule, so a weekdays Topic created on a Saturday is not left empty until Monday
test("isTopicScheduled still brews a brand-new weekdays Topic on a weekend", () => {
	expect(isTopicScheduled({ frequency: "weekdays" }, undefined, new Date("2026-07-25T12:00:00Z"))).toBe(true)
})

// a running Scan never spends the window: isTopicScheduled reads completed Scans only,
// so a new topic holding just the pending scan its creation scheduled reaches isTopicScheduled with no completed date and is due immediately
test("isTopicScheduled treats a topic with only a pending running scan as due", () => {
	const now = new Date("2026-07-24T12:00:00Z")
	expect(isTopicScheduled({ frequency: "daily" }, undefined, now)).toBe(true)
})

// a call made while the wrapped task is still running is skipped, rather than overlapping it
test("toExclusiveTask skips a call made while the previous call is still running", async () => {
	const deferredTask = toDeferredTask<string>()
	let callCount = 0
	const exclusiveTask = toExclusiveTask(() => {
		callCount++
		return deferredTask.promise
	})

	// the first call starts the task and is still awaiting it when the second call arrives
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

// a topic scan that ends failed returns normally, so the topic sweep's catch never sees it, but the summary counts it as failed
test("trackSweepOutcome counts a failed-status scan as failed", () => {
	const summary = emptyTopicSweepSummary()
	trackSweepOutcome(summary, { status: "failed" })
	expect(summary).toEqual({ scheduled: 1, scanned: 0, skippedOverQuota: 0, failed: 1 })
})

// a succeeded topic scan, and a scan the runner returned nothing for, both count as scanned
test("trackSweepOutcome counts a succeeded scan as scanned", () => {
	const summarySucceeded = emptyTopicSweepSummary()
	trackSweepOutcome(summarySucceeded, { status: "succeeded" })
	expect(summarySucceeded.scanned).toBe(1)
	expect(summarySucceeded.failed).toBe(0)

	// no topic scan row came back, so there is no failure to report
	const summaryMissing = emptyTopicSweepSummary()
	trackSweepOutcome(summaryMissing, undefined)
	expect(summaryMissing.scanned).toBe(1)
})

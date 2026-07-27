// schedule tests for frequency, scheduling, and topic sweep summary decisions
import { expect, test } from "bun:test"
import { frequencyWindowMs, isTopicScheduled, trackSweepOutcome } from "./schedule"

// a fresh zeroed topic sweep summary to fold outcomes into
function emptyTopicSweepSummary() {
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

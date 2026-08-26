// topic tests for the api

import { expect, test } from "bun:test"
import type { TopicScan } from "@shared/contracts"
import { isTakingDailySlot, toLastSucceededTopicScan } from "./helpers"

// a scan history row, varied only by the status and id each test needs
function scanRow(id: string, status: TopicScan["status"]): TopicScan {
	return {
		id,
		status,
		startedAt: "2026-07-24T12:00:00.000Z",
		finishedAt: "2026-07-24T12:01:00.000Z",
		stoppedAt: null,
		// the counts, cost, and failure reason the page reads
		foundCount: 0,
		keptCount: 0,
		filteredCount: 0,
		costDollars: null,
		error: null,
	}
}

// scheduling counts a failed scan as the window spent, but the page's baseline stays the last succeeded scan
test("toLastSucceededScan skips a newer failed scan", () => {
	const history = [scanRow("newest-failed", "failed"), scanRow("succeeded", "succeeded"), scanRow("older", "succeeded")]
	expect(toLastSucceededTopicScan(history)?.id).toBe("succeeded")
})

// a history with nothing succeeded yet has no baseline to report
test("toLastSucceededScan is undefined when no scan has succeeded", () => {
	expect(toLastSucceededTopicScan([scanRow("failed", "failed"), scanRow("running", "running")])).toBeUndefined()
})

// only a move to a daily frequency takes one of the plan's daily slots
test("isTakingDailySlot fires only on a move to a daily frequency", () => {
	// a new topic has no current frequency, so asking for a daily frequency takes a slot
	expect(isTakingDailySlot("daily")).toBe(true)
	expect(isTakingDailySlot("weekdays")).toBe(true)
	expect(isTakingDailySlot("weekly")).toBe(false)

	// moving a weekly topic onto either daily or weekdays frequency takes a slot
	expect(isTakingDailySlot("daily", "weekly")).toBe(true)
	expect(isTakingDailySlot("weekdays", "weekly")).toBe(true)
})

// a topic already on a daily frequency keeps the slot it holds, however many slots its owner has.
test("isTakingDailySlot never fires for a topic already on a daily frequency", () => {
	// re-saving the same frequency takes nothing, and so does moving between the two daily frequencies
	expect(isTakingDailySlot("daily", "daily")).toBe(false)
	expect(isTakingDailySlot("weekdays", "weekdays")).toBe(false)
	expect(isTakingDailySlot("daily", "weekdays")).toBe(false)
	expect(isTakingDailySlot("weekdays", "daily")).toBe(false)

	// giving a slot up takes nothing either
	expect(isTakingDailySlot("weekly", "daily")).toBe(false)
})

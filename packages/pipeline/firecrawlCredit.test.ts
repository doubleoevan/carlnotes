// tests for the spent Firecrawl credit: a review's mark in Redis, and the sweep's one report of it
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as monitoring from "@carlnotes/server/monitoring"
import { markFirecrawlCreditSpent, reportFirecrawlCreditSpent } from "./firecrawlCredit"

// put the Redis client and every spy back after each test
afterEach(() => {
	restoreRedisClient()
	mock.restore()
})

test("a spent credit that reviews mark many times is reported once, and not again by the next sweep", async () => {
	// thirty pages find the credit spent within one minute, and the process writes one mark
	const storedValueByKey = stubRedisClient()
	const reportSpy = spyOn(monitoring, "reportThresholdCrossing").mockReturnValue(true)
	const markedAt = Date.UTC(2026, 10, 20, 12)
	for (let page = 0; page < 30; page++) {
		await markFirecrawlCreditSpent(markedAt + page * 1000)
	}
	expect(JSON.parse(storedValueByKey.get("firecrawl-credit-spent") ?? "null")).toEqual({ markedAt })

	// the sweep reports the mark as one crossing and takes it away
	expect(await reportFirecrawlCreditSpent()).toBe(true)
	expect(reportSpy.mock.calls.map(([thresholdCrossing]) => thresholdCrossing)).toEqual([
		{
			condition: "firecrawl-credit-spent",
			message: "Firecrawl's credit is spent, so the review scores each page on its snippet",
			values: { markedAt },
		},
	])
	expect(storedValueByKey.has("firecrawl-credit-spent")).toBe(false)

	// the next sweep finds no mark and reports nothing
	expect(await reportFirecrawlCreditSpent()).toBe(false)
	expect(reportSpy).toHaveBeenCalledTimes(1)
})

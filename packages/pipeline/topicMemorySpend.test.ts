import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import {
	canSpendOnTopicMemories,
	chargeTopicMemorySpend,
	newTopicMemorySpend,
	saveTopicMemorySpend,
} from "./topicMemorySpend"

afterEach(restoreConnectionPool)

test("an update may start another model call until its total reaches its limit", () => {
	const spend = newTopicMemorySpend("scan-1", 0.12)
	expect(canSpendOnTopicMemories(spend)).toBe(true)
	chargeTopicMemorySpend(spend, 0.07)
	expect(canSpendOnTopicMemories(spend)).toBe(true)

	// the call that passes the limit was already running, and no call starts after it
	chargeTopicMemorySpend(spend, 0.06)
	expect(spend.spentDollars).toBeCloseTo(0.13)
	expect(canSpendOnTopicMemories(spend)).toBe(false)

	// a call outside an update keeps no total and is never stopped
	chargeTopicMemorySpend(undefined, 5)
	expect(canSpendOnTopicMemories(undefined)).toBe(true)
})

test("a save writes the Scan row once with everything spent since the last save", async () => {
	// three model calls, then one write of their sum
	const queries = stubConnectionPool()
	const spend = newTopicMemorySpend("scan-1", 0.12)
	for (const dollars of [0.01, 0.02, 0.005]) {
		chargeTopicMemorySpend(spend, dollars)
	}
	await saveTopicMemorySpend(spend)

	// one write, of the three calls' sum on their Scan
	expect(queries).toHaveLength(1)
	expect(queries[0]?.text).toStartWith('update "scans" set "cost"')
	expect(queries[0]?.values).toEqual(expect.arrayContaining(["0.035000", "scan-1"]))

	// a save with nothing new writes nothing, and the next one writes only what was added
	await saveTopicMemorySpend(spend)
	expect(queries).toHaveLength(1)
	chargeTopicMemorySpend(spend, 0.04)
	await saveTopicMemorySpend(spend)
	expect(queries[1]?.values).toEqual(expect.arrayContaining(["0.040000", "scan-1"]))
})

// the backfill's spend must reach the day's total and never the old Scan's cost, which its owner's month sums
test("the platform's spend is saved as a spends row for the Topic, and never on the Scan", async () => {
	const queries = stubConnectionPool()
	const spend = newTopicMemorySpend("scan-1", 0.12, "topic-1")
	chargeTopicMemorySpend(spend, 0.03)
	await saveTopicMemorySpend(spend)

	// one row with the platform's kind and the Topic, and nothing written to the Scan
	expect(queries).toHaveLength(1)
	expect(queries[0]?.text).toStartWith('insert into "spends"')
	expect(queries[0]?.values).toEqual(expect.arrayContaining(["topicMemoryBackfill", 0.03, "topic-1"]))
	expect(queries[0]?.values).not.toContain("scan-1")
})

test("a save that fails leaves its amount for the next save", async () => {
	const spend = newTopicMemorySpend("scan-1", 0.12)
	chargeTopicMemorySpend(spend, 0.03)
	stubConnectionPool(() => {
		throw new Error("connection lost")
	})
	await expect(saveTopicMemorySpend(spend)).rejects.toThrow()

	// the same three cents are written once the database answers again
	const queries = stubConnectionPool()
	await saveTopicMemorySpend(spend)
	expect(queries[0]?.values).toEqual(expect.arrayContaining(["0.030000"]))
})

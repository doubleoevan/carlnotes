// topic helpers tests: a Topic's first Scan is marked failed instead of started if its owner's key budget is spent.
// the first Scan starts if the budget is not spent or cannot be read
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { FIRST_SCAN_SPENT_BUDGET_REASON } from "@shared/scanFailure"
import { connectionPool } from "../../db"
import * as litellm from "../../worker/litellm"
import * as scan from "../../worker/scan"
import * as screen from "../../worker/screen"
import { type Scan, startFirstScan } from "./helpers"

// the connection pool's own query, put back after each test along with the spies
const originalConnectionPoolQuery = connectionPool.query
afterEach(() => {
	connectionPool.query = originalConnectionPoolQuery
	mock.restore()
})

// the first Scan row that creation opened, with only its id set
const FIRST_SCAN = { id: "scan-1" } as Scan

// a query that the stubbed connection pool was sent
type SentQuery = { text: string; values: unknown[] }

// the spies on the Source screens and the scan start
type FirstScanSpies = {
	screenPendingSourcesSpy: Mock<typeof screen.screenPendingSources>
	screenTopicSourcesSpy: Mock<typeof screen.screenTopicSources>
	scanTopicSpy: Mock<typeof scan.scanTopic>
}

// stub the connection pool to return no rows, and return each query that the stub is sent
function stubConnectionPool(): SentQuery[] {
	const sentQueries: SentQuery[] = []
	connectionPool.query = ((queryConfig: { text: string }, values: unknown[]) => {
		sentQueries.push({ text: queryConfig.text, values })
		return Promise.resolve({ rows: [], fields: [], rowCount: 0 })
	}) as unknown as typeof connectionPool.query
	return sentQueries
}

// spy on the Source screens and the scan start, each stubbed to do nothing
function spyOnFirstScan(): FirstScanSpies {
	return {
		screenPendingSourcesSpy: spyOn(screen, "screenPendingSources").mockResolvedValue(undefined),
		screenTopicSourcesSpy: spyOn(screen, "screenTopicSources").mockResolvedValue(undefined),
		scanTopicSpy: spyOn(scan, "scanTopic").mockResolvedValue({ status: "running" }),
	}
}

// a spent budget marks the open first Scan failed with the budget reason and starts the Source screens without the wait
test("a first Scan whose owner's budget is spent is marked failed and never started", async () => {
	// an owner whose key budget is spent
	const sentQueries = stubConnectionPool()
	const { screenPendingSourcesSpy, screenTopicSourcesSpy, scanTopicSpy } = spyOnFirstScan()
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(true)

	// start the first Scan
	await startFirstScan("topic-1", FIRST_SCAN, "owner-1")

	// the update marks the Scan failed with the reason, only if the Scan is still running and undispatched
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toStartWith('update "scans"')
	expect(sentQueries[0]?.text).toContain('"scans"."status" = $')
	expect(sentQueries[0]?.text).toContain('"scans"."dispatched_at" is null')
	expect(sentQueries[0]?.values).toEqual(
		expect.arrayContaining(["failed", FIRST_SCAN_SPENT_BUDGET_REASON, "scan-1", "running"]),
	)

	// no Scan started, and the Source screens started without the wait
	expect(scanTopicSpy).not.toHaveBeenCalled()
	expect(screenPendingSourcesSpy).toHaveBeenCalledWith("topic-1")
	expect(screenTopicSourcesSpy).not.toHaveBeenCalled()
})

// a budget that is not spent waits for the Source screens and starts the first Scan
test("a first Scan whose owner's budget is not spent starts after the Source screens", async () => {
	// an owner whose key budget is not spent
	const sentQueries = stubConnectionPool()
	const { screenTopicSourcesSpy, scanTopicSpy } = spyOnFirstScan()
	const isUserLiteLLMKeyBudgetExhaustedSpy = spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(false)

	// start the first Scan
	await startFirstScan("topic-1", FIRST_SCAN, "owner-1")

	// the owner's budget was read, the Scan started as a creation Scan on its existing row, and no Scan row was written
	expect(isUserLiteLLMKeyBudgetExhaustedSpy).toHaveBeenCalledWith("owner-1")
	expect(screenTopicSourcesSpy).toHaveBeenCalledWith("topic-1")
	expect(scanTopicSpy).toHaveBeenCalledWith(FIRST_SCAN, "topic-1", "owner-1", "creation", true)
	expect(sentQueries).toHaveLength(0)

	// the Source screens ran before the Scan started
	const screenTopicSourcesCallOrder = screenTopicSourcesSpy.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
	const scanTopicCallOrder = scanTopicSpy.mock.invocationCallOrder[0] ?? 0
	expect(screenTopicSourcesCallOrder).toBeLessThan(scanTopicCallOrder)
})

// a budget read that throws an error is reported, and the first Scan starts
test("a first Scan starts if the budget read throws an error, and the error is reported", async () => {
	// a budget read that throws an error, with a quiet console and error report
	stubConnectionPool()
	const { scanTopicSpy } = spyOnFirstScan()
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockRejectedValue(new Error("connection lost"))
	spyOn(console, "error").mockImplementation(() => {})
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// start the first Scan
	await startFirstScan("topic-1", FIRST_SCAN, "owner-1")

	// the error is reported once, and the Scan started
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(scanTopicSpy).toHaveBeenCalledTimes(1)
})

// a creation with no first Scan row writes no Scan row and starts no Scan, even if the owner's budget is spent
test("a creation with no first Scan row screens the Sources and starts no Scan", async () => {
	// an owner whose key budget is spent, and no first Scan row
	const sentQueries = stubConnectionPool()
	const { screenTopicSourcesSpy, scanTopicSpy } = spyOnFirstScan()
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(true)

	// call startFirstScan with no first Scan row
	await startFirstScan("topic-1", undefined, "owner-1")

	// the Sources were screened, no Scan row was written, and no Scan started
	expect(screenTopicSourcesSpy).toHaveBeenCalledWith("topic-1")
	expect(sentQueries).toHaveLength(0)
	expect(scanTopicSpy).not.toHaveBeenCalled()
})

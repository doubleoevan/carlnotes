// topic save helper tests: a Topic's first Scan is marked failed instead of started if its owner's key budget or
// monthly budget is spent, or the owner's spend is past the manual scans cutoff. the first Scan starts if no check is
// reached or a check cannot be read
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import { FIRST_SCAN_PAUSED_REASON, FIRST_SCAN_SPENT_BUDGET_REASON } from "@carlnotes/contracts/scanFailure"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import * as litellm from "@carlnotes/models/litellm"
import * as scan from "@carlnotes/pipeline/scan"
import * as screen from "@carlnotes/pipeline/screen"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import * as authorization from "../authorization"
import { type Scan, startFirstScan } from "./saveHelpers"

// the connection pool's own query, put back after each test along with the spies
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the first Scan row that creation opened, with only its id set
const FIRST_SCAN = { id: "scan-1" } as Scan

// the spies on the Source screens, the scan start, and the monthly budget and manual scans cutoff checks
type FirstScanSpies = {
	screenPendingSourcesSpy: Mock<typeof screen.screenPendingSources>
	screenTopicSourcesSpy: Mock<typeof screen.screenTopicSources>
	scanTopicSpy: Mock<typeof scan.scanTopic>
	isMonthlySpendExhaustedSpy: Mock<typeof authorization.isMonthlySpendExhausted>
	isMonthlyBudgetCutoffPassedSpy: Mock<typeof monthlyBudgetCutoffs.isMonthlyBudgetCutoffPassed>
}

// spy on the Source screens and the scan start, each stubbed to do nothing, and on the monthly budget and the manual
// scans cutoff, each stubbed as not reached
function spyOnFirstScan(): FirstScanSpies {
	return {
		screenPendingSourcesSpy: spyOn(screen, "screenPendingSources").mockResolvedValue(undefined),
		screenTopicSourcesSpy: spyOn(screen, "screenTopicSources").mockResolvedValue(undefined),
		scanTopicSpy: spyOn(scan, "scanTopic").mockResolvedValue({ status: "running" }),
		isMonthlySpendExhaustedSpy: spyOn(authorization, "isMonthlySpendExhausted").mockResolvedValue(false),
		isMonthlyBudgetCutoffPassedSpy: spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(false),
	}
}

// expect one update that marks the open first Scan failed with the reason, only if the Scan is still running and
// undispatched
function expectFirstScanFailed(sentQueries: SentQuery[], failureReason: string): void {
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toStartWith('update "scans"')
	expect(sentQueries[0]?.text).toContain('"scans"."status" = $')
	expect(sentQueries[0]?.text).toContain('"scans"."dispatched_at" is null')
	expect(sentQueries[0]?.values).toEqual(expect.arrayContaining(["failed", failureReason, "scan-1", "running"]))
}

// a spent budget marks the open first Scan failed with the budget reason and starts the Source screens without the wait
test("a first Scan whose owner's budget is spent is marked failed and never started", async () => {
	// an owner whose key budget is spent
	const sentQueries = stubConnectionPool()
	const { screenPendingSourcesSpy, screenTopicSourcesSpy, scanTopicSpy } = spyOnFirstScan()
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(true)

	// start the first Scan
	await startFirstScan("topic-1", FIRST_SCAN, "owner-1")

	// the update marks the Scan failed with the spent budget reason
	expectFirstScanFailed(sentQueries, FIRST_SCAN_SPENT_BUDGET_REASON)

	// no Scan started, and the Source screens started without the wait
	expect(scanTopicSpy).not.toHaveBeenCalled()
	expect(screenPendingSourcesSpy).toHaveBeenCalledWith("topic-1")
	expect(screenTopicSourcesSpy).not.toHaveBeenCalled()
})

// a spent monthly budget marks the first Scan failed as spent, even past the manual scans cutoff
test("a first Scan whose owner's monthly budget is spent is marked failed as spent and never started", async () => {
	// an owner whose key budget is not spent, whose monthly budget is spent, and whose spend is past the cutoff
	const sentQueries = stubConnectionPool()
	const { isMonthlySpendExhaustedSpy, isMonthlyBudgetCutoffPassedSpy, scanTopicSpy } = spyOnFirstScan()
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(false)
	isMonthlySpendExhaustedSpy.mockResolvedValue(true)
	isMonthlyBudgetCutoffPassedSpy.mockResolvedValue(true)

	// start the first Scan
	await startFirstScan("topic-1", FIRST_SCAN, "owner-1")

	// the Scan is marked failed with the spent budget reason, and no Scan started
	expect(isMonthlySpendExhaustedSpy).toHaveBeenCalledWith("owner-1")
	expectFirstScanFailed(sentQueries, FIRST_SCAN_SPENT_BUDGET_REASON)
	expect(scanTopicSpy).not.toHaveBeenCalled()
})

// spend past the manual scans cutoff marks the first Scan failed as paused and starts the Source screens without the wait
test("a first Scan whose owner's spend is past the manual scans cutoff is marked failed as paused", async () => {
	// an owner whose budgets are not spent, and whose spend is past the manual scans cutoff
	const sentQueries = stubConnectionPool()
	const { isMonthlyBudgetCutoffPassedSpy, screenPendingSourcesSpy, screenTopicSourcesSpy, scanTopicSpy } =
		spyOnFirstScan()
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(false)
	isMonthlyBudgetCutoffPassedSpy.mockResolvedValue(true)

	// start the first Scan
	await startFirstScan("topic-1", FIRST_SCAN, "owner-1")

	// the Scan is marked failed with the paused reason, no Scan started, and the Source screens started without the wait
	expect(isMonthlyBudgetCutoffPassedSpy).toHaveBeenCalledWith("owner-1", "manualScans")
	expectFirstScanFailed(sentQueries, FIRST_SCAN_PAUSED_REASON)
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
test("a first Scan starts if the budget reads throw an error, and each error is reported", async () => {
	// a key budget, monthly budget, and cutoff read that each throw an error, with a quiet console and error report
	stubConnectionPool()
	const { isMonthlySpendExhaustedSpy, isMonthlyBudgetCutoffPassedSpy, scanTopicSpy } = spyOnFirstScan()
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockRejectedValue(new Error("connection lost"))
	isMonthlySpendExhaustedSpy.mockRejectedValue(new Error("connection lost"))
	isMonthlyBudgetCutoffPassedSpy.mockRejectedValue(new Error("connection lost"))
	const reportErrorSpy = quietErrorReports()

	// start the first Scan
	await startFirstScan("topic-1", FIRST_SCAN, "owner-1")

	// each error is reported, and the Scan started
	expect(reportErrorSpy).toHaveBeenCalledTimes(3)
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

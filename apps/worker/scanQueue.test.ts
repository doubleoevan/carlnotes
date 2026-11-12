// scan queue tests: the undispatched Scans the sweep dispatches, the waiting scans it starts, the queue report, and the
// backlog crossing
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { SCHEDULED_SCAN_SPENT_BUDGET_REASON } from "@carlnotes/contracts/scanFailure"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import type { DailySpendCutoffState } from "@carlnotes/db/dailySpendCutoffs"
import { toDailySpendCutoffState } from "@carlnotes/db/dailySpendCutoffTestFixtures"
import { scans } from "@carlnotes/db/schema/scans"
import * as litellm from "@carlnotes/models/litellm"
import * as scan from "@carlnotes/pipeline/scan"
import { toScanBacklogCrossing } from "@carlnotes/pipeline/scanWorkflowClient"
import * as monitoring from "@carlnotes/server/monitoring"
import { reportScanQueue, startUndispatchedScans, toDispatchableScanCount } from "./scanQueue"

// put each spied function and the connection pool's own query back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// an undispatched Scan row's id and manual flag, and optionally its Topic, whether it is a first scan, and whether it
// waits
type ToUndispatchedScanRowOptions = {
	id: string
	isManual: boolean
	topicId?: string
	isFirstScan?: boolean
	isWaitingScan?: boolean
}

// an undispatched Scan row as the connection pool returns the row, followed by the first scan and waiting scan flags.
// only its id, Topic, owner, status, and manual flag are set
function toUndispatchedScanRow({
	id,
	isManual,
	topicId = "topic-1",
	isFirstScan = false,
	isWaitingScan = false,
}: ToUndispatchedScanRowOptions): unknown[] {
	const scanRow = toTableRow(scans, { id, topicId, ownerId: "owner-1", status: "running", isManual })
	return [...scanRow, isFirstScan, isWaitingScan]
}

// how many rows that are not waiting one sweep may start, the default dispatch limit with an empty scan queue
const DISPATCHABLE_SCAN_COUNT = 100

// a cutoff state that passes no cutoff and leaves no scan waiting
const UNAVAILABLE_CUTOFF_STATE: DailySpendCutoffState = { status: "unavailable" }

// the day's free-plan spend past the scheduled scans cutoff
const PASSED_CUTOFF_FREE_PLAN_SPEND_CENTS = 15_000

// an undispatched Scan whose owner's budget is spent is marked failed instead of started, unless the Scan is manual
test("an undispatched Scan whose owner's budget is spent is marked failed, and a manual Scan still starts", async () => {
	// a scheduled row and a manual row of one owner whose key budget is spent, with a quiet console
	stubConnectionPool(() => [
		toUndispatchedScanRow({ id: "scheduled-scan", isManual: false }),
		toUndispatchedScanRow({ id: "manual-scan", isManual: true }),
	])
	spyOn(console, "log").mockImplementation(() => {})
	const isUserLiteLLMKeyBudgetExhaustedSpy = spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(true)
	const failUnstartedScanSpy = spyOn(scan, "failUnstartedScan").mockResolvedValue(undefined)
	const scanTopicSpy = spyOn(scan, "scanTopic").mockResolvedValue({ status: "running" })
	await startUndispatchedScans({
		cutoffState: UNAVAILABLE_CUTOFF_STATE,
		dispatchableScanCount: DISPATCHABLE_SCAN_COUNT,
	})

	// the owner's budget is read for the scheduled row only
	expect(isUserLiteLLMKeyBudgetExhaustedSpy.mock.calls).toEqual([["owner-1"]])

	// the scheduled Scan is marked failed with the budget reason, and only the manual Scan is started
	expect(failUnstartedScanSpy.mock.calls).toEqual([["scheduled-scan", SCHEDULED_SCAN_SPENT_BUDGET_REASON]])
	expect(scanTopicSpy).toHaveBeenCalledTimes(1)
	expect(scanTopicSpy.mock.calls[0]?.[0]).toMatchObject({ id: "manual-scan" })
	expect(scanTopicSpy.mock.calls[0]?.slice(1)).toEqual(["topic-1", "owner-1", "manual", true])
})

// the sweep starts an undispatched Scan whose owner's budget is not spent
test("an undispatched Scan whose owner's budget is not spent starts", async () => {
	// a scheduled row whose owner's key budget is not spent, with a quiet console
	stubConnectionPool(() => [toUndispatchedScanRow({ id: "scheduled-scan", isManual: false })])
	spyOn(console, "log").mockImplementation(() => {})
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(false)
	const failUnstartedScanSpy = spyOn(scan, "failUnstartedScan").mockResolvedValue(undefined)
	const scanTopicSpy = spyOn(scan, "scanTopic").mockResolvedValue({ status: "running" })
	await startUndispatchedScans({
		cutoffState: UNAVAILABLE_CUTOFF_STATE,
		dispatchableScanCount: DISPATCHABLE_SCAN_COUNT,
	})

	// the Scan is started as a scheduled Scan on its existing row, and no Scan is marked failed
	expect(failUnstartedScanSpy).not.toHaveBeenCalled()
	expect(scanTopicSpy.mock.calls[0]?.slice(1)).toEqual(["topic-1", "owner-1", "scheduled", true])
})

// a budget read that throws an error is reported, and the Scan is neither marked failed nor started
test("an undispatched Scan whose owner's budget read throws an error is reported and left undispatched", async () => {
	// a scheduled row whose owner's budget read throws an error, with a quiet console and error report
	const sentQueries = stubConnectionPool(() => [toUndispatchedScanRow({ id: "scheduled-scan", isManual: false })])
	spyOn(console, "log").mockImplementation(() => {})
	spyOn(console, "error").mockImplementation(() => {})
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockRejectedValue(new Error("connection lost"))
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const failUnstartedScanSpy = spyOn(scan, "failUnstartedScan").mockResolvedValue(undefined)
	const scanTopicSpy = spyOn(scan, "scanTopic").mockResolvedValue({ status: "running" })
	await startUndispatchedScans({
		cutoffState: UNAVAILABLE_CUTOFF_STATE,
		dispatchableScanCount: DISPATCHABLE_SCAN_COUNT,
	})

	// the error is reported with the Scan's id, and only the read of the undispatched rows was sent
	expect(reportErrorSpy.mock.calls[0]?.slice(1)).toEqual(["scheduled-scan", { scanId: "scheduled-scan" }])
	expect(sentQueries.map((sentQuery) => sentQuery.text.split(" ")[0])).toEqual(["select"])
	expect(failUnstartedScanSpy).not.toHaveBeenCalled()
	expect(scanTopicSpy).not.toHaveBeenCalled()
})

// a row that stopped running after the sweep read the row matches no update, so the sweep starts no Scan for that row
test("an undispatched Scan that stopped running after the sweep read the row is not started", async () => {
	// the select returns a scheduled row, and the update of its start time matches no row
	const undispatchedScanRows = [toUndispatchedScanRow({ id: "scheduled-scan", isManual: false })]
	const sentQueries = stubConnectionPool(({ text }) => (text.startsWith("select") ? undispatchedScanRows : []))

	// an owner whose key budget is not spent, with a quiet console
	spyOn(console, "log").mockImplementation(() => {})
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(false)
	const scanTopicSpy = spyOn(scan, "scanTopic").mockResolvedValue({ status: "running" })
	await startUndispatchedScans({
		cutoffState: UNAVAILABLE_CUTOFF_STATE,
		dispatchableScanCount: DISPATCHABLE_SCAN_COUNT,
	})

	// the update matches only a row that is still running, and no Scan started
	expect(sentQueries[1]?.text).toStartWith('update "scans"')
	expect(sentQueries[1]?.text).toContain('"scans"."status" = $')
	expect(sentQueries[1]?.values).toEqual(expect.arrayContaining(["scheduled-scan", "running"]))
	expect(scanTopicSpy).not.toHaveBeenCalled()
})

// twelve waiting scans with a limit of five start the five oldest, and the other seven Topics stay waiting
test("waiting scans start oldest first up to the first scan dispatch limit", async () => {
	// twelve waiting first scans of their own Topics, oldest first as the select orders them, with a quiet console
	const waitingScanRows = Array.from({ length: 12 }, (_, i) =>
		toUndispatchedScanRow({
			id: `scan-${i}`,
			isManual: false,
			topicId: `topic-${i}`,
			isFirstScan: true,
			isWaitingScan: true,
		}),
	)
	const sentQueries = stubConnectionPool(() => waitingScanRows)
	spyOn(console, "log").mockImplementation(() => {})
	const scanTopicSpy = spyOn(scan, "scanTopic").mockResolvedValue({ status: "running" })
	const waitingScanTopicIds = await startUndispatchedScans({
		cutoffState: toDailySpendCutoffState(PASSED_CUTOFF_FREE_PLAN_SPEND_CENTS, { firstScanDispatchLimit: 5 }),
		dispatchableScanCount: DISPATCHABLE_SCAN_COUNT,
	})

	// the select orders the rows oldest first, and the five oldest start with the creation trigger
	expect(sentQueries[0]?.text).toContain('order by "scans"."started_at" asc, "scans"."id" asc')
	expect(scanTopicSpy.mock.calls.map((scanTopicCall) => scanTopicCall[1])).toEqual([
		"topic-0",
		"topic-1",
		"topic-2",
		"topic-3",
		"topic-4",
	])
	expect(scanTopicSpy.mock.calls.every((scanTopicCall) => scanTopicCall[3] === "creation")).toBe(true)

	// the other seven Topics are returned as still waiting
	expect([...waitingScanTopicIds]).toEqual([
		"topic-5",
		"topic-6",
		"topic-7",
		"topic-8",
		"topic-9",
		"topic-10",
		"topic-11",
	])
})

// a limit of zero starts no waiting scan
test("a first scan dispatch limit of zero starts no waiting scan", async () => {
	// one waiting first scan, with a quiet console
	stubConnectionPool(() => [
		toUndispatchedScanRow({ id: "first-scan", isManual: false, isFirstScan: true, isWaitingScan: true }),
	])
	spyOn(console, "log").mockImplementation(() => {})
	const scanTopicSpy = spyOn(scan, "scanTopic").mockResolvedValue({ status: "running" })
	const waitingScanTopicIds = await startUndispatchedScans({
		cutoffState: toDailySpendCutoffState(PASSED_CUTOFF_FREE_PLAN_SPEND_CENTS, { firstScanDispatchLimit: 0 }),
		dispatchableScanCount: DISPATCHABLE_SCAN_COUNT,
	})

	// no Scan starts, and its Topic stays waiting
	expect(scanTopicSpy).not.toHaveBeenCalled()
	expect([...waitingScanTopicIds]).toEqual(["topic-1"])
})

// a waiting first scan starts without its owner's key budget being read
test("a waiting first scan whose owner's key budget is spent still starts", async () => {
	// one waiting first scan of an owner whose key budget is spent, with a quiet console
	stubConnectionPool(() => [
		toUndispatchedScanRow({ id: "first-scan", isManual: false, isFirstScan: true, isWaitingScan: true }),
	])
	spyOn(console, "log").mockImplementation(() => {})
	const isUserLiteLLMKeyBudgetExhaustedSpy = spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(true)
	const failUnstartedScanSpy = spyOn(scan, "failUnstartedScan").mockResolvedValue(undefined)
	const scanTopicSpy = spyOn(scan, "scanTopic").mockResolvedValue({ status: "running" })
	await startUndispatchedScans({
		cutoffState: toDailySpendCutoffState(PASSED_CUTOFF_FREE_PLAN_SPEND_CENTS, { firstScanDispatchLimit: 5 }),
		dispatchableScanCount: DISPATCHABLE_SCAN_COUNT,
	})

	// the key budget is never read, and the Scan starts with the creation trigger
	expect(isUserLiteLLMKeyBudgetExhaustedSpy).not.toHaveBeenCalled()
	expect(failUnstartedScanSpy).not.toHaveBeenCalled()
	expect(scanTopicSpy.mock.calls[0]?.slice(1)).toEqual(["topic-1", "owner-1", "creation", true])
})

// an orphaned first scan that does not wait starts with the creation trigger, not the scheduled one
test("an orphaned first scan starts with the creation trigger", async () => {
	// an orphaned first scan whose owner's key budget is not spent, with a quiet console
	const sentQueries = stubConnectionPool(() => [
		toUndispatchedScanRow({ id: "first-scan", isManual: false, isFirstScan: true }),
	])
	spyOn(console, "log").mockImplementation(() => {})
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(false)
	const scanTopicSpy = spyOn(scan, "scanTopic").mockResolvedValue({ status: "running" })
	await startUndispatchedScans({
		cutoffState: UNAVAILABLE_CUTOFF_STATE,
		dispatchableScanCount: DISPATCHABLE_SCAN_COUNT,
	})

	// the unavailable state's waiting filter matches nothing, and the Scan starts with the creation trigger
	expect(sentQueries[0]?.text).toContain("(false)")
	expect(scanTopicSpy.mock.calls[0]?.slice(1)).toEqual(["topic-1", "owner-1", "creation", true])
})

// rows that are not waiting start oldest first up to the dispatchable count, and the rest wait for the next sweep
test("undispatched Scans past the dispatchable count wait for the next sweep", async () => {
	// three rows of three Topics, oldest first, that a sweep of two dispatches reads
	stubConnectionPool(() => [
		toUndispatchedScanRow({ id: "scan-1", isManual: true, topicId: "topic-1" }),
		toUndispatchedScanRow({ id: "scan-2", isManual: true, topicId: "topic-2" }),
		toUndispatchedScanRow({ id: "scan-3", isManual: true, topicId: "topic-3" }),
	])
	spyOn(console, "log").mockImplementation(() => {})
	const scanTopicSpy = spyOn(scan, "scanTopic").mockResolvedValue({ status: "running" })
	const waitingScanTopicIds = await startUndispatchedScans({
		cutoffState: UNAVAILABLE_CUTOFF_STATE,
		dispatchableScanCount: 2,
	})

	// the two oldest start, and the third Topic counts as still waiting
	expect(scanTopicSpy.mock.calls.map((scanTopicCall) => scanTopicCall[1])).toEqual(["topic-1", "topic-2"])
	expect([...waitingScanTopicIds]).toEqual(["topic-3"])
})

// a Scan queue with a worker polling it and nothing waiting
const HEALTHY_SCAN_QUEUE = { pollerCount: 1, backlogCount: 0, oldestBacklogAgeMs: 0 }

// the sweep reports a queue nothing polls, and a backlog whose oldest Scan waited past 15 minutes
test("reportScanQueue reports a queue nothing polls and a backlog past its limit", async () => {
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	await reportScanQueue(async () => HEALTHY_SCAN_QUEUE)
	expect(consoleErrorSpy).not.toHaveBeenCalled()

	// a queue nothing polls
	await reportScanQueue(async () => ({ ...HEALTHY_SCAN_QUEUE, pollerCount: 0 }))
	expect(String(consoleErrorSpy.mock.calls.at(-1)?.[0])).toContain("no temporal worker is polling the scan queue")

	// a queue whose oldest Scan has waited 20 minutes
	await reportScanQueue(async () => ({ pollerCount: 1, backlogCount: 12, oldestBacklogAgeMs: 20 * 60 * 1000 }))
	expect(consoleErrorSpy.mock.calls.at(-1)).toEqual([
		"a scan waited over 15 minutes for a slot",
		{ backlogCount: 12, oldestBacklogAgeMs: 20 * 60 * 1000 },
	])
})

// a describe that fails is logged and reads as no description, which leaves the sweep the whole dispatch limit, and the
// sweep goes on
test("reportScanQueue never fails the sweep", async () => {
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	await expect(reportScanQueue(() => Promise.reject(new Error("temporal unreachable")))).resolves.toBeNull()
	expect(consoleErrorSpy.mock.calls[0]?.[0]).toBe("could not read the scan task queue")
})

// an older server gives a depth and no age, so its backlog is never reported as past the limit
test("toScanBacklogCrossing needs a known age past 15 minutes", () => {
	const backedUpQueue = { pollerCount: 1, backlogCount: 40 }
	expect(toScanBacklogCrossing({ ...backedUpQueue, oldestBacklogAgeMs: null })).toBeNull()
	expect(toScanBacklogCrossing({ ...backedUpQueue, oldestBacklogAgeMs: 15 * 60 * 1000 })).toBeNull()
	expect(toScanBacklogCrossing({ ...backedUpQueue, oldestBacklogAgeMs: 16 * 60 * 1000 })?.condition).toBe(
		"scan-backlog",
	)
})

// the dispatchable scan count is the limit minus the backlog, never below zero, and the whole limit for an unread queue
test("toDispatchableScanCount subtracts the backlog from the limit and keeps the limit for an unread queue", () => {
	expect(toDispatchableScanCount({ pollerCount: 2, backlogCount: 30, oldestBacklogAgeMs: null })).toBe(70)
	expect(toDispatchableScanCount({ pollerCount: 2, backlogCount: 500, oldestBacklogAgeMs: null })).toBe(0)
	expect(toDispatchableScanCount(null)).toBe(100)
})

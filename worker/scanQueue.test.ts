// scan queue tests: the undispatched Scans the sweep dispatches, the queue report, and the backlog crossing
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { SCHEDULED_SCAN_SPENT_BUDGET_REASON } from "@shared/scanFailure"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "../db/connectionPoolStub"
import { scans } from "../db/schema/scans"
import * as litellm from "./litellm"
import * as scan from "./scan"
import { reportScanQueue, startUndispatchedScans } from "./schedule"
import { toScanBacklogCrossing } from "./temporalClient"

// put each spied function and the connection pool's own query back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the id and the manual flag of an undispatched Scan row
type ToUndispatchedScanRowOptions = { id: string; isManual: boolean }

// an undispatched Scan row as the connection pool returns the row.
// only its id, Topic, owner, status, and manual flag are set
function toUndispatchedScanRow({ id, isManual }: ToUndispatchedScanRowOptions): unknown[] {
	return toTableRow(scans, { id, topicId: "topic-1", ownerId: "owner-1", status: "running", isManual })
}

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
	await startUndispatchedScans()

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
	await startUndispatchedScans()

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
	await startUndispatchedScans()

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
	await startUndispatchedScans()

	// the update matches only a row that is still running, and no Scan started
	expect(sentQueries[1]?.text).toStartWith('update "scans"')
	expect(sentQueries[1]?.text).toContain('"scans"."status" = $')
	expect(sentQueries[1]?.values).toEqual(expect.arrayContaining(["scheduled-scan", "running"]))
	expect(scanTopicSpy).not.toHaveBeenCalled()
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

// a describe that fails is logged, and the sweep goes on
test("reportScanQueue never fails the sweep", async () => {
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	await expect(reportScanQueue(() => Promise.reject(new Error("temporal unreachable")))).resolves.toBeUndefined()
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

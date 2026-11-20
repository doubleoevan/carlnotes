// reaper tests: each branch of a row past its limit (started again once, failed after its restart, failed with no
// workflow to start, left while its workflow runs, terminated a day later, and left alone if Temporal cannot be read)
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { DAY_MS } from "@carlnotes/contracts/time"
import {
	NOT_RESTARTABLE_REASON,
	REAPED_REASON,
	type ReapedKind,
	reapStaleRows,
	type StaleRow,
	TERMINATED_REASON,
	toCreatedStaleRow,
} from "./reaper"
import { NOW, spyOnTemporal } from "./reaperTestFixtures"

// put back the module mocks after each test
afterEach(() => {
	mock.restore()
})

// a kind's limit of one hour
const LIMIT_MS = 60 * 60 * 1000

// a row whose work began a while past the limit, restartable unless a test says otherwise
function toStaleRow(id: string, staleRow: Partial<StaleRow> = {}): StaleRow {
	const startedAt = new Date(NOW.getTime() - LIMIT_MS - 60_000)
	return { id, workflowId: `workflow-${id}`, startedAt, restartState: "available", ...staleRow }
}

// a kind that reads the given rows and records each restart and each failing write
function toReapedKind(staleRows: StaleRow[]): {
	reapedKind: ReapedKind<StaleRow>
	restartedIds: string[]
	failedRows: [string, string][]
	startedBeforeTimes: Date[]
} {
	// what the kind was asked to do
	const restartedIds: string[] = []
	const failedRows: [string, string][] = []
	const startedBeforeTimes: Date[] = []
	const reapedKind: ReapedKind<StaleRow> = {
		name: "test row",
		stage: "worker",
		limitMs: LIMIT_MS,
		loadStaleRows: async (startedBefore) => {
			startedBeforeTimes.push(startedBefore)
			return staleRows
		},
		// each write is kept in place of a database write
		restartWork: async (staleRow) => {
			restartedIds.push(staleRow.id)
		},
		failRow: async (staleRow, reason) => {
			failedRows.push([staleRow.id, reason])
		},
	}
	return { reapedKind, restartedIds, failedRows, startedBeforeTimes }
}

test("a row whose workflow is gone is started again once, and the read asks for rows past the limit", async () => {
	const { readSpy } = spyOnTemporal({ isRunning: false })
	const { reapedKind, restartedIds, failedRows, startedBeforeTimes } = toReapedKind([toStaleRow("row-1")])

	// the work starts again on the same row, and nothing is failed
	const reapSummary = await reapStaleRows({ reapedKind, now: NOW })
	expect(reapSummary).toEqual({ restarted: 1, failed: 0, running: 0, terminated: 0, unread: 0 })
	expect(restartedIds).toEqual(["row-1"])
	expect(failedRows).toEqual([])

	// Temporal was asked about the row's own workflow, and the read took the rows past the limit
	expect(readSpy).toHaveBeenCalledWith("workflow-row-1")
	expect(startedBeforeTimes).toEqual([new Date(NOW.getTime() - LIMIT_MS)])
})

test("a row that was already started again is failed once its workflow is gone again", async () => {
	spyOnTemporal({ isRunning: false })
	const { reapedKind, restartedIds, failedRows } = toReapedKind([toStaleRow("row-1", { restartState: "used" })])
	const reapSummary = await reapStaleRows({ reapedKind, now: NOW })
	expect(reapSummary).toMatchObject({ restarted: 0, failed: 1 })
	expect(restartedIds).toEqual([])
	expect(failedRows).toEqual([["row-1", REAPED_REASON]])
})

test("a row with no workflow to start is failed without a Temporal read", async () => {
	const { readSpy } = spyOnTemporal({ isRunning: false })
	const { reapedKind, restartedIds, failedRows } = toReapedKind([toStaleRow("row-1", { workflowId: null })])
	const reapSummary = await reapStaleRows({ reapedKind, now: NOW })

	// the row is failed for having nothing to start, and Temporal is never asked
	expect(reapSummary).toMatchObject({ restarted: 0, failed: 1 })
	expect(restartedIds).toEqual([])
	expect(failedRows).toEqual([["row-1", NOT_RESTARTABLE_REASON]])
	expect(readSpy).not.toHaveBeenCalled()
})

// a healthy workflow on a backed-up queue can be older than its limit, so it is never stopped at the limit
test("a row whose workflow still runs is left and reported once for the kind", async () => {
	const { terminateSpy, reportSpy } = spyOnTemporal({ isRunning: true })
	const { reapedKind, restartedIds, failedRows } = toReapedKind([toStaleRow("row-1"), toStaleRow("row-2")])
	const reapSummary = await reapStaleRows({ reapedKind, now: NOW })

	// both rows stay as they are, and one report counts them
	expect(reapSummary).toEqual({ restarted: 0, failed: 0, running: 2, terminated: 0, unread: 0 })
	expect([restartedIds, failedRows]).toEqual([[], []])
	expect(terminateSpy).not.toHaveBeenCalled()
	expect(reportSpy).toHaveBeenCalledTimes(1)
	expect(reportSpy.mock.calls[0]?.[2]).toEqual({ rowCount: "2" })
})

test("a workflow that still runs a day past the limit is terminated, and its row failed", async () => {
	const { terminateSpy } = spyOnTemporal({ isRunning: true })
	const startedAt = new Date(NOW.getTime() - LIMIT_MS - DAY_MS - 60_000)
	const { reapedKind, failedRows } = toReapedKind([toStaleRow("row-1", { startedAt })])
	const reapSummary = await reapStaleRows({ reapedKind, now: NOW })

	// the workflow is stopped with the reason, and the row is failed with the same one
	expect(reapSummary).toMatchObject({ running: 0, terminated: 1 })
	expect(terminateSpy).toHaveBeenCalledWith("workflow-row-1", TERMINATED_REASON)
	expect(failedRows).toEqual([["row-1", TERMINATED_REASON]])
})

// an unreachable server must never read as a missing workflow, which would start healthy work again
test("a Temporal read that fails leaves the row and every row after it alone", async () => {
	const { readSpy, reportSpy } = spyOnTemporal({ isRunning: true })
	readSpy.mockRejectedValue(new Error("temporal is down"))
	spyOn(console, "error").mockImplementation(() => {})
	const { reapedKind, restartedIds, failedRows } = toReapedKind([toStaleRow("row-1"), toStaleRow("row-2")])
	const reapSummary = await reapStaleRows({ reapedKind, now: NOW })

	// nothing starts and nothing fails, one read was tried, and the failure is reported
	expect(reapSummary).toEqual({ restarted: 0, failed: 0, running: 0, terminated: 0, unread: 2 })
	expect([restartedIds, failedRows]).toEqual([[], []])
	expect(readSpy).toHaveBeenCalledTimes(1)
	expect(reportSpy).toHaveBeenCalledTimes(1)
})

test("a lost lease stops the reap before its next row", async () => {
	spyOnTemporal({ isRunning: false })
	const { reapedKind, restartedIds } = toReapedKind([toStaleRow("row-1")])
	const lostLease = AbortSignal.abort(new Error("the lease is lost"))
	await expect(reapStaleRows({ reapedKind, now: NOW, signal: lostLease })).rejects.toThrow("the lease is lost")
	expect(restartedIds).toEqual([])
})

// a row that can always be started again begins its limit at its restart, or else at its creation
test("a restarted row's work last began at its restart, and its restart is used", () => {
	const createdAt = new Date(NOW.getTime() - 3 * LIMIT_MS)
	const createdRow = { id: "row-1", workflowId: "workflow-row-1", createdAt, restartedAt: null }
	expect(toCreatedStaleRow(createdRow)).toEqual({ ...toStaleRow("row-1"), startedAt: createdAt })

	// ten minutes after its restart the row is inside its limit again, and a second loss fails it
	const restartedAt = new Date(NOW.getTime() - 10 * 60 * 1000)
	expect(toCreatedStaleRow({ ...createdRow, restartedAt })).toMatchObject({
		startedAt: restartedAt,
		restartState: "used",
	})
})

// pending object deletion retry tests: the keys ready to retry are deleted through deleteStoredObject, a key that
// fails again after a day is reported once, and a run with nothing to retry does nothing
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { DAY_MS } from "@shared/time"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import { retryPendingObjectDeletions } from "./retryPendingObjectDeletions"
import * as store from "./store"

// a recorded time two days back
const TWO_DAYS_AGO = new Date(Date.now() - 2 * DAY_MS)

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the rows ready to retry, in the column order the retry selects: the key, when it was recorded, its attempts, and its report time
function stubPendingObjectDeletionRows(pendingObjectDeletionRows: unknown[][]): ReturnType<typeof stubConnectionPool> {
	return stubConnectionPool(({ text }) => (text.startsWith("select") ? pendingObjectDeletionRows : []))
}

// a key that deletes is counted, and a day-old key that fails again is reported once with its attempts and marked
test("a pending key is deleted, and a stale key that fails again is reported once", async () => {
	// two pending keys, one whose delete succeeds and one whose delete fails, the second recorded two days ago
	const sentQueries = stubPendingObjectDeletionRows([
		["a", TWO_DAYS_AGO, 0, null],
		["b", TWO_DAYS_AGO, 3, null],
	])
	spyOn(store, "deleteStoredObject").mockResolvedValueOnce(true).mockResolvedValueOnce(false)
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	spyOn(console, "log").mockImplementation(() => {})

	// one deleted, one failed, and the failed one reported and marked
	expect(await retryPendingObjectDeletions()).toEqual({ deletedCount: 1, failedCount: 1 })
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ objectKey: "b", attemptCount: "4" })
	const reportedUpdates = sentQueries.filter((sentQuery) =>
		sentQuery.text.startsWith('update "pending_object_deletions"'),
	)
	expect(reportedUpdates).toHaveLength(1)
	expect(reportedUpdates[0]?.values).toContain("b")
})

// a key reported already, and a key younger than a day, fail quietly
test("a reported key and a young key are not reported", async () => {
	// two pending keys whose deletes fail: one reported already, one recorded just now
	stubPendingObjectDeletionRows([
		["reported", TWO_DAYS_AGO, 5, new Date()],
		["young", new Date(), 1, null],
	])
	spyOn(store, "deleteStoredObject").mockResolvedValue(false)
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	spyOn(console, "log").mockImplementation(() => {})

	// both fail, and neither is reported
	expect(await retryPendingObjectDeletions()).toEqual({ deletedCount: 0, failedCount: 2 })
	expect(reportErrorSpy).not.toHaveBeenCalled()
})

// a run with nothing to retry sends the one select and logs nothing
test("a run with nothing to retry does nothing", async () => {
	// no pending keys, with the delete and the log watched
	const sentQueries = stubPendingObjectDeletionRows([])
	const deleteStoredObjectSpy = spyOn(store, "deleteStoredObject")
	const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {})

	// nothing deleted, nothing logged, one select
	expect(await retryPendingObjectDeletions()).toEqual({ deletedCount: 0, failedCount: 0 })
	expect(sentQueries).toHaveLength(1)
	expect(deleteStoredObjectSpy).not.toHaveBeenCalled()
	expect(consoleLogSpy).not.toHaveBeenCalled()
})

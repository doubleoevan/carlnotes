// stale scan tests: the stale filter's two cutoffs, the waiting scans it never matches, the stale window that clears
// the longest a Scan may run, and the reap that clears its Topics' scan status copies
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { HOUR_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { scans } from "@carlnotes/db/schema/scans"
import * as statusReadCaches from "@carlnotes/db/statusReadCaches"
import * as monitoring from "@carlnotes/server/monitoring"
import {
	INGEST_ATTEMPTS,
	INGEST_TIMEOUT_MS,
	MAX_SCAN_DURATION_MS,
	QUEUED_STAGE_TIMEOUT_MS,
	REVIEW_ATTEMPTS,
	REVIEW_TIMEOUT_MS,
} from "./stageTimeouts"
import { reapStaleScans, staleScanWindowMs, toStaleScanFilter } from "./staleScans"

// put the connection pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the stale filter measures a picked-up scan from its pickup and a scan that no worker picked up from its dispatch
test("the stale filter measures a picked-up scan from its pickup and a queued scan from its dispatch", () => {
	const now = new Date("2026-07-22T12:00:00Z")
	const { sql, params } = db.select({ id: scans.id }).from(scans).where(toStaleScanFilter(now)).toSQL()

	// the picked-up branch compares the pickup time, and the queued branch compares the dispatch time
	expect(sql).toContain('"scans"."picked_up_at" is not null and "scans"."picked_up_at" <')
	expect(sql).toContain('"scans"."picked_up_at" is null and "scans"."dispatched_at" <')

	// the running status is written into the SQL, so the partial index of the running Scans holds under any plan
	expect(sql).toContain(`"scans"."status" = 'running'`)

	// the pickup cutoff is the stale window, and the dispatch cutoff is the queued stage bound plus the margin.
	// a comparison against a timestamp column sends its date as an iso string
	const staleScanMarginMs = 15 * 60 * 1000
	expect(params).toEqual([
		new Date(now.getTime() - staleScanWindowMs()).toISOString(),
		new Date(now.getTime() - (QUEUED_STAGE_TIMEOUT_MS + staleScanMarginMs)).toISOString(),
	])
})

// a stage queued behind a burst waits through the burst: the queued stage bound outlasts every attempt
test("the queued stage bound outlasts every attempt of ingest and review", () => {
	expect(QUEUED_STAGE_TIMEOUT_MS).toBeGreaterThan(INGEST_TIMEOUT_MS * INGEST_ATTEMPTS)
	expect(QUEUED_STAGE_TIMEOUT_MS).toBeGreaterThan(REVIEW_TIMEOUT_MS * REVIEW_ATTEMPTS)
})

// the stale scan window waits out the longest a picked-up Scan may legally run, its waits for a slot included
test("the stale scan window clears the longest a Scan may legally run", () => {
	expect(staleScanWindowMs()).toBeGreaterThan(MAX_SCAN_DURATION_MS)
})

// a waiting scan is a running row with no dispatch time, so the reaper never matches one however old it is
test("a six-hour-old waiting scan is never reaped as stale", () => {
	const sixHoursFromNow = new Date(Date.now() + 6 * HOUR_MS)
	const { sql } = db.select({ id: scans.id }).from(scans).where(toStaleScanFilter(sixHoursFromNow)).toSQL()
	expect(sql).toContain(`where ("scans"."status" = 'running' and "scans"."dispatched_at" is not null and (`)
})

// a Topic with two reaped Scans loses its scan status copy once
test("a reap clears the scan status copy of each reaped Scan's Topic once", async () => {
	// the update reaps two Scans of one Topic and one Scan of another
	const clearStatusReadsSpy = spyOn(statusReadCaches, "clearStatusReads").mockResolvedValue()
	spyOn(monitoring, "reportError").mockImplementation(() => {})
	spyOn(console, "log").mockImplementation(() => {})
	stubConnectionPool(() => [
		["scan-1", "topic-1"],
		["scan-2", "topic-1"],
		["scan-3", "topic-2"],
	])
	expect(await reapStaleScans()).toBe(3)
	expect(clearStatusReadsSpy).toHaveBeenCalledWith("scan", "topic-1", "topic-2")
})

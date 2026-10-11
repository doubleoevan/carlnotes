// stale scan tests: the stale filter's two cutoffs, and the stale window that clears the longest a Scan may run
import { expect, test } from "bun:test"
import { db } from "../db"
import { scans } from "../db/schema/scans"
import { staleScanWindowMs, toStaleScanFilter } from "./staleScans"
import {
	FINISH_ATTEMPTS,
	FINISH_TIMEOUT_MS,
	FINISH_TOTAL_TIMEOUT_MS,
	INGEST_ATTEMPTS,
	INGEST_TIMEOUT_MS,
	INGEST_TOTAL_TIMEOUT_MS,
	MAX_SCAN_DURATION_MS,
	REVIEW_ATTEMPTS,
	REVIEW_TIMEOUT_MS,
	REVIEW_TOTAL_TIMEOUT_MS,
} from "./workflows/stageTimeouts"

// the stale filter measures a picked-up scan from its pickup and a scan that no worker picked up from its dispatch
test("the stale filter measures a picked-up scan from its pickup and a queued scan from its dispatch", () => {
	const now = new Date("2026-07-22T12:00:00Z")
	const { sql, params } = db.select({ id: scans.id }).from(scans).where(toStaleScanFilter(now)).toSQL()

	// the picked-up branch compares the pickup time, and the queued branch compares the dispatch time
	expect(sql).toContain('"scans"."picked_up_at" is not null and "scans"."picked_up_at" <')
	expect(sql).toContain('"scans"."picked_up_at" is null and "scans"."dispatched_at" <')

	// the pickup cutoff is the stale window, and the dispatch cutoff is the ingest and finish total timeouts plus the margin.
	// a comparison against a timestamp column sends its date as an iso string
	const staleScanMarginMs = 15 * 60 * 1000
	expect(params).toEqual([
		"running",
		new Date(now.getTime() - staleScanWindowMs()).toISOString(),
		new Date(now.getTime() - (INGEST_TOTAL_TIMEOUT_MS + FINISH_TOTAL_TIMEOUT_MS + staleScanMarginMs)).toISOString(),
	])
})

// the stale scan window waits out the longest a Scan may legally run
test("the stale scan window clears the longest a Scan may legally run", () => {
	// each stage's total covers its own retries, so the summed total cannot fall behind a retry policy that changes
	expect(INGEST_TOTAL_TIMEOUT_MS).toBe(INGEST_TIMEOUT_MS * INGEST_ATTEMPTS)
	expect(REVIEW_TOTAL_TIMEOUT_MS).toBe(REVIEW_TIMEOUT_MS * REVIEW_ATTEMPTS)
	expect(FINISH_TOTAL_TIMEOUT_MS).toBe(FINISH_TIMEOUT_MS * FINISH_ATTEMPTS)

	// the window clears the across-attempts total, not the sum of one attempt per stage
	expect(MAX_SCAN_DURATION_MS).toBe(INGEST_TOTAL_TIMEOUT_MS + REVIEW_TOTAL_TIMEOUT_MS + FINISH_TOTAL_TIMEOUT_MS)
	expect(staleScanWindowMs()).toBeGreaterThan(MAX_SCAN_DURATION_MS)
})

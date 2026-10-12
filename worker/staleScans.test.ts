// stale scan tests: the stale filter's two cutoffs, and the stale window that clears the longest a Scan may run
import { expect, test } from "bun:test"
import { db } from "../db"
import { scans } from "../db/schema/scans"
import { staleScanWindowMs, toStaleScanFilter } from "./staleScans"
import {
	INGEST_ATTEMPTS,
	INGEST_TIMEOUT_MS,
	MAX_SCAN_DURATION_MS,
	QUEUED_STAGE_TIMEOUT_MS,
	REVIEW_ATTEMPTS,
	REVIEW_TIMEOUT_MS,
} from "./workflows/stageTimeouts"

// the stale filter measures a picked-up scan from its pickup and a scan that no worker picked up from its dispatch
test("the stale filter measures a picked-up scan from its pickup and a queued scan from its dispatch", () => {
	const now = new Date("2026-07-22T12:00:00Z")
	const { sql, params } = db.select({ id: scans.id }).from(scans).where(toStaleScanFilter(now)).toSQL()

	// the picked-up branch compares the pickup time, and the queued branch compares the dispatch time
	expect(sql).toContain('"scans"."picked_up_at" is not null and "scans"."picked_up_at" <')
	expect(sql).toContain('"scans"."picked_up_at" is null and "scans"."dispatched_at" <')

	// the pickup cutoff is the stale window, and the dispatch cutoff is the queued stage bound plus the margin.
	// a comparison against a timestamp column sends its date as an iso string
	const staleScanMarginMs = 15 * 60 * 1000
	expect(params).toEqual([
		"running",
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

// the stale scan close-out: a dispatched scan that outran its stages, and a scan that never started
import { reportError } from "@shared/monitoring"
import { and, eq, isNotNull, isNull, lt, or, type SQL, sql } from "drizzle-orm"
import { db } from "../db"
import { scans } from "../db/schema/scans"
import { FINISH_TOTAL_TIMEOUT_MS, INGEST_TOTAL_TIMEOUT_MS, MAX_SCAN_DURATION_MS } from "./workflows/stageTimeouts"

// how long a picked-up Scan may stay running past its stages' own limit before it counts as gone
const STALE_SCAN_MARGIN_MS = 15 * 60 * 1000

const STALE_SCAN_MS = Number(Bun.env.STALE_SCAN_MS ?? MAX_SCAN_DURATION_MS + STALE_SCAN_MARGIN_MS)

// how long a dispatched Scan that no worker has picked up may wait for a slot before it counts as gone.
// Temporal counts queue time against the ingest stage's schedule-to-close timeout, and the finish stage waits behind the same backlog
const STALE_DISPATCH_MS = INGEST_TOTAL_TIMEOUT_MS + FINISH_TOTAL_TIMEOUT_MS + STALE_SCAN_MARGIN_MS

// the failure reasons that a closed-out Scan records, for a picked-up Scan and for a Scan that no worker picked up
const STALE_SCAN_REASON = "scan stopped responding and was closed out"

const STALE_DISPATCH_REASON = "scan waited too long to start and was closed out"

/**
 * Returns how long a picked-up Scan may stay running before it counts as failed.
 */
export function staleScanWindowMs(): number {
	return STALE_SCAN_MS
}

/**
 * Marks every Scan that the stale filter selects as failed and returns how many Scans were closed out.
 */
export async function failStaleScans(topicId?: string, now = new Date()): Promise<number> {
	// close out the stale Scans in one update, with a separate failure reason for a Scan that no worker picked up
	const staleScanFilter = toStaleScanFilter(now)
	const staleScanIds = await db
		.update(scans)
		.set({
			status: "failed",
			error: sql`case when ${scans.pickedUpAt} is null then ${STALE_DISPATCH_REASON} else ${STALE_SCAN_REASON} end`,
			finishedAt: now,
		})
		.where(topicId ? and(staleScanFilter, eq(scans.topicId, topicId)) : staleScanFilter)
		.returning({ id: scans.id })

	// log and report the Scans that went quiet past a window longer than their stages allow
	if (staleScanIds.length > 0) {
		console.log(`closed out ${staleScanIds.length} dispatched scans that went quiet`)
		reportError(new Error(`closed out ${staleScanIds.length} hung scans`), "scheduled-scan", {
			hungScanCount: String(staleScanIds.length),
			...(topicId ? { topicId } : {}),
		})
	}
	return staleScanIds.length
}

/**
 * Returns the filter that selects the dispatched Scans that count as gone.
 * A picked-up Scan is gone if its pickup is older than the stale window.
 * A Scan that no worker picked up is gone if its dispatch is older than the ingest and finish stages' total timeouts plus the margin.
 */
export function toStaleScanFilter(now: Date): SQL | undefined {
	return and(
		eq(scans.status, "running"),
		isNotNull(scans.dispatchedAt),
		or(
			and(isNotNull(scans.pickedUpAt), lt(scans.pickedUpAt, new Date(now.getTime() - STALE_SCAN_MS))),
			and(isNull(scans.pickedUpAt), lt(scans.dispatchedAt, new Date(now.getTime() - STALE_DISPATCH_MS))),
		),
	)
}

// the scan queue as the sweep sees it: the rows of a caller that exited before dispatching them, the queue's report,
// and how many Scans one sweep may hand to Temporal
import { toPositiveInteger } from "@shared/envSettings"
import { reportError, reportThresholdCrossing } from "@shared/monitoring"
import { SCHEDULED_SCAN_SPENT_BUDGET_REASON } from "@shared/scanFailure"
import { and, eq, isNotNull, isNull } from "drizzle-orm"
import { db } from "../db"
import { scans } from "../db/schema/scans"
import { isUserLiteLLMKeyBudgetExhausted } from "./litellm"
import { failUnstartedScan, scanTopic } from "./scan"
import { describeScanQueue, SCAN_TASK_QUEUE, type ScanQueueDescription, toScanBacklogCrossing } from "./temporalClient"

// how many Scans one sweep may hand to Temporal, less the scan queue's current backlog, from SCAN_DISPATCH_LIMIT or the
// default
const DEFAULT_SCAN_DISPATCH_LIMIT = 100
const SCAN_DISPATCH_LIMIT = toPositiveInteger(Bun.env.SCAN_DISPATCH_LIMIT, DEFAULT_SCAN_DISPATCH_LIMIT)

/**
 * Returns how many Scans one sweep may start: the dispatch limit minus the backlog, or the whole limit for an unread queue.
 */
export function toDispatchableScanCount(scanQueueDescription: ScanQueueDescription | null): number {
	return Math.max(0, SCAN_DISPATCH_LIMIT - (scanQueueDescription?.backlogCount ?? 0))
}

/**
 * Start the temporal workflow for every Scan that was opened but never dispatched.
 * This is the backstop for the gap between writing a Scan row and starting its workflow.
 * an orphaned scan row recovers on the next sweep instead of waiting out a window.
 * A start that the engine rejects means that Scan is already running, and that rejection sets the dispatch marker,
 * so a scan row is only ever retried until it is genuinely dispatched.
 * A Scan whose owner's key budget is spent is marked failed instead of started, unless a user started the Scan by hand.
 */
export async function startUndispatchedScans(): Promise<void> {
	// only rows still open and still attached to a Topic
	const undispatchedScans = await db
		.select()
		.from(scans)
		.where(and(eq(scans.status, "running"), isNull(scans.dispatchedAt), isNotNull(scans.topicId)))
	if (undispatchedScans.length === 0) {
		return
	}

	// one failing Scan never stops the others
	console.log(`dispatching ${undispatchedScans.length} scans that were opened but never started`)

	// the scan row records what it was opened for, so the sweep starts it the way its original caller would have
	for (const scan of undispatchedScans) {
		try {
			// mark the Scan failed instead of starting the Scan if the owner's key budget is spent.
			// the key budget of a manual Scan's owner was read before the user started that Scan
			if (!scan.isManual && (await isUserLiteLLMKeyBudgetExhausted(scan.ownerId))) {
				await failUnstartedScan(scan.id, SCHEDULED_SCAN_SPENT_BUDGET_REASON)
				continue
			}

			// set the Scan's start time to now, unless the Scan stopped running after the sweep read the row
			const runningScanIds = await db
				.update(scans)
				.set({ startedAt: new Date() })
				.where(and(eq(scans.id, scan.id), eq(scans.status, "running")))
				.returning({ id: scans.id })
			if (runningScanIds.length === 0) {
				continue
			}

			// start the Scan
			await scanTopic(scan, scan.topicId as string, scan.ownerId, scan.isManual ? "manual" : "scheduled", true)
		} catch (error) {
			// the row stays undispatched, so the next sweep attempts it again
			console.error(`could not dispatch scan ${scan.id}`, error)
			reportError(error, "scheduled-scan", { scanId: scan.id })
		}
	}
}

/**
 * Reports a Scan queue that nothing polls, and a backlog whose oldest Scan has waited over 15 minutes for a slot.
 * Returns the queue's description, or null for a failed read.
 */
export async function reportScanQueue(
	readScanQueue: () => Promise<ScanQueueDescription> = describeScanQueue,
): Promise<ScanQueueDescription | null> {
	// a failed read is logged, and the sweep goes on
	let scanQueue: ScanQueueDescription
	try {
		scanQueue = await readScanQueue()
	} catch (error) {
		console.error("could not read the scan task queue", error)
		return null
	}

	// no poller means no scans will run
	if (scanQueue.pollerCount === 0) {
		console.error("no temporal worker is polling the scan queue, so no scans will run")
		reportError(new Error("no temporal worker is polling the scan queue"), "scheduled-scan", {
			taskQueue: SCAN_TASK_QUEUE,
		})
	}

	// a backlog past its limit means the scans run, but late
	const backlogCrossing = toScanBacklogCrossing(scanQueue)
	if (backlogCrossing) {
		console.error(backlogCrossing.message, backlogCrossing.values)
		reportThresholdCrossing(backlogCrossing)
	}
	return scanQueue
}

// the scan queue as the sweep sees it: the rows of a caller that exited before dispatching them, the waiting scans the
// first scan dispatch limit starts, the queue's report, and how many Scans one sweep may hand to Temporal

import { SCHEDULED_SCAN_SPENT_BUDGET_REASON } from "@carlnotes/contracts/scanFailure"
import { db } from "@carlnotes/db"
import {
	type DailySpendCutoffState,
	toFirstScanDispatchLimit,
	toFirstScanFilter,
	toWaitingScanFilter,
} from "@carlnotes/db/dailySpendCutoffs"
import { scans } from "@carlnotes/db/schema/scans"
import { isUserLiteLLMKeyBudgetExhausted } from "@carlnotes/models/litellm"
import { failUnstartedScan, scanTopic } from "@carlnotes/pipeline/scan"
import {
	describeScanQueue,
	SCAN_TASK_QUEUE,
	type ScanQueueDescription,
	type ScanTrigger,
	toScanBacklogCrossing,
} from "@carlnotes/pipeline/temporalClient"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { reportError, reportThresholdCrossing } from "@carlnotes/server/monitoring"
import { and, asc, eq, getTableColumns, isNotNull, isNull, sql } from "drizzle-orm"

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

// the cutoff state the sweep read, and how many rows that are not waiting the sweep may start
type StartUndispatchedScansOptions = { cutoffState: DailySpendCutoffState; dispatchableScanCount: number }

/**
 * Starts the Temporal workflow for the Scans that were opened but never dispatched, and returns the Topic ids whose
 * Scan still waits.
 * A row that is not waiting fell in the gap between writing a Scan row and starting its workflow, and starts with the
 * trigger its caller would have used. Its owner's spent key budget marks it failed instead, unless a user started it
 * by hand.
 * Those rows start oldest first up to the dispatchable count, and the rest wait for the next sweep.
 * Waiting scans start oldest first up to the first scan dispatch limit, with no key budget read.
 * A start that the engine rejects means that Scan is already running, and that rejection sets the dispatch marker.
 */
export async function startUndispatchedScans({
	cutoffState,
	dispatchableScanCount,
}: StartUndispatchedScansOptions): Promise<Set<string>> {
	// read the open rows still attached to a Topic, oldest first, with whether each is a first scan and whether it waits
	const undispatchedScans = await db
		.select({
			...getTableColumns(scans),
			isFirstScan: sql<boolean>`${toFirstScanFilter()}`,
			isWaitingScan: sql<boolean>`(${toWaitingScanFilter(cutoffState)})`,
		})
		.from(scans)
		.where(and(eq(scans.status, "running"), isNull(scans.dispatchedAt), isNotNull(scans.topicId)))
		.orderBy(asc(scans.startedAt), asc(scans.id))
	if (undispatchedScans.length === 0) {
		return new Set()
	}

	// split the waiting scans the limit starts from the ones that keep waiting
	const waitingScans = undispatchedScans.filter((undispatchedScan) => undispatchedScan.isWaitingScan)
	const firstScanDispatchLimit = toFirstScanDispatchLimit(cutoffState)
	const startedWaitingScans = waitingScans.slice(0, firstScanDispatchLimit)
	const stillWaitingScans = waitingScans.slice(firstScanDispatchLimit)

	// split the rows that are not waiting into the ones the dispatchable count starts and the ones the next sweep starts
	const orphanedScans = undispatchedScans.filter((undispatchedScan) => !undispatchedScan.isWaitingScan)
	const startedOrphanedScans = orphanedScans.slice(0, dispatchableScanCount)
	const deferredOrphanedScans = orphanedScans.slice(dispatchableScanCount)
	console.log(
		`dispatching ${startedOrphanedScans.length} of ${orphanedScans.length} scans that were opened but never started and ${startedWaitingScans.length} of ${waitingScans.length} waiting scans`,
	)

	// one failing Scan never stops the others
	for (const orphanedScan of startedOrphanedScans) {
		await dispatchUndispatchedScan({ undispatchedScan: orphanedScan, isKeyBudgetRead: !orphanedScan.isManual })
	}
	for (const startedWaitingScan of startedWaitingScans) {
		await dispatchUndispatchedScan({ undispatchedScan: startedWaitingScan, isKeyBudgetRead: false })
	}
	return new Set(
		[...stillWaitingScans, ...deferredOrphanedScans].map((undispatchedScan) => undispatchedScan.topicId as string),
	)
}

// an undispatched row with whether it is its Topic's first scan
type UndispatchedScan = typeof scans.$inferSelect & { isFirstScan: boolean }

// the row to start, and whether its owner's key budget is read first
type DispatchUndispatchedScanOptions = { undispatchedScan: UndispatchedScan; isKeyBudgetRead: boolean }

// start one undispatched row, after failing it instead if its owner's key budget is read and spent
async function dispatchUndispatchedScan({
	undispatchedScan,
	isKeyBudgetRead,
}: DispatchUndispatchedScanOptions): Promise<void> {
	try {
		// mark the Scan failed instead of starting the Scan if the owner's key budget is spent
		if (isKeyBudgetRead && (await isUserLiteLLMKeyBudgetExhausted(undispatchedScan.ownerId))) {
			await failUnstartedScan(undispatchedScan.id, SCHEDULED_SCAN_SPENT_BUDGET_REASON)
			return
		}

		// set the Scan's start time to now, unless the Scan stopped running after the sweep read the row
		const runningScanIds = await db
			.update(scans)
			.set({ startedAt: new Date() })
			.where(and(eq(scans.id, undispatchedScan.id), eq(scans.status, "running")))
			.returning({ id: scans.id })
		if (runningScanIds.length === 0) {
			return
		}

		// start the Scan the way its original caller would have
		const scanTrigger = toUndispatchedScanTrigger(undispatchedScan)
		await scanTopic(undispatchedScan, undispatchedScan.topicId as string, undispatchedScan.ownerId, scanTrigger, true)
	} catch (error) {
		// the row stays undispatched, so the next sweep attempts it again
		console.error(`could not dispatch scan ${undispatchedScan.id}`, error)
		reportError(error, "scheduled-scan", { scanId: undispatchedScan.id })
	}
}

// the trigger a row was opened for: manual by hand, creation for a Topic's first scan, and scheduled otherwise
function toUndispatchedScanTrigger(undispatchedScan: UndispatchedScan): ScanTrigger {
	if (undispatchedScan.isManual) {
		return "manual"
	}
	return undispatchedScan.isFirstScan ? "creation" : "scheduled"
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

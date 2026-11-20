// the scan queue as the sweep sees it: the rows of a caller that exited before dispatching them, the waiting scans the
// first scan dispatch limit starts, the queue's report, and how many Scans one sweep may hand to Temporal. the sweep's
// report of a film queue that nothing polls is here beside the scan queue's

import { SCHEDULED_SCAN_SPENT_BUDGET_REASON } from "@carlnotes/contracts/scanFailure"
import { TOPIC_VIDEO_TASK_QUEUE } from "@carlnotes/contracts/topicVideoWork"
import { db, isScanRunning } from "@carlnotes/db"
import {
	type DailySpendCutoffState,
	toFirstScanDispatchLimit,
	toFirstScanFilter,
	toWaitingScanFilter,
} from "@carlnotes/db/dailySpendCutoffs"
import { scans } from "@carlnotes/db/schema/scans"
import { isUserLiteLLMKeyBudgetExhausted } from "@carlnotes/models/litellm"
import { failUnstartedScan, scanTopic } from "@carlnotes/pipeline/scan"
import { SCAN_TASK_QUEUE, SCHEDULED_SCAN_TASK_QUEUE, type ScanTrigger } from "@carlnotes/pipeline/scanWorkflowClient"
import { isTemporalTransportFailure } from "@carlnotes/pipeline/temporalClient"
import { describeTaskQueue, type TaskQueueDescription } from "@carlnotes/pipeline/temporalTaskQueues"
import { reportError } from "@carlnotes/server/monitoring"
import { topicVideoConcurrency } from "@carlnotes/server/podcastEpisodeSettings"
import { scanDispatchLimit } from "@carlnotes/server/scanSettings"
import { and, asc, eq, getTableColumns, isNotNull, isNull, sql } from "drizzle-orm"
import { readReportedTaskQueue } from "./taskQueueReads"

/**
 * Returns how many Scans one sweep may start on a queue: the scan dispatch limit minus that queue's backlog, or the
 * whole limit for an unread queue. A limit of zero starts none. The scheduled Scans are sized by their own queue's
 * backlog, and the relay of the rows that were never dispatched by the Scan queue's.
 */
export function toDispatchableScanCount(scanQueueDescription: TaskQueueDescription | null): number {
	return Math.max(0, scanDispatchLimit() - (scanQueueDescription?.backlogCount ?? 0))
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
		.where(and(isScanRunning, isNull(scans.dispatchedAt), isNotNull(scans.topicId)))
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

	// one failing Scan never stops the others, and a Temporal server that cannot be reached stops them all: every
	// later start would wait out its deadline and fail the same way, so the rows stay for the next sweep
	const scansToDispatch = [
		...startedOrphanedScans.map((orphanedScan) => ({
			undispatchedScan: orphanedScan,
			isKeyBudgetRead: !orphanedScan.isManual,
		})),
		...startedWaitingScans.map((startedWaitingScan) => ({
			undispatchedScan: startedWaitingScan,
			isKeyBudgetRead: false,
		})),
	]
	for (const scanToDispatch of scansToDispatch) {
		if ((await dispatchUndispatchedScan(scanToDispatch)) === "unreachable") {
			break
		}
	}
	return new Set(
		[...stillWaitingScans, ...deferredOrphanedScans].map((undispatchedScan) => undispatchedScan.topicId as string),
	)
}

// an undispatched row with whether it is its Topic's first scan
type UndispatchedScan = typeof scans.$inferSelect & { isFirstScan: boolean }

// the row to start, and whether its owner's key budget is read first
type DispatchUndispatchedScanOptions = { undispatchedScan: UndispatchedScan; isKeyBudgetRead: boolean }

// start one undispatched row, after failing it instead if its owner's key budget is read and spent. returns
// "unreachable" if the start could not reach the Temporal server, and "handled" otherwise
async function dispatchUndispatchedScan({
	undispatchedScan,
	isKeyBudgetRead,
}: DispatchUndispatchedScanOptions): Promise<"handled" | "unreachable"> {
	try {
		// mark the Scan failed instead of starting the Scan if the owner's key budget is spent
		if (isKeyBudgetRead && (await isUserLiteLLMKeyBudgetExhausted(undispatchedScan.ownerId))) {
			await failUnstartedScan(undispatchedScan.id, SCHEDULED_SCAN_SPENT_BUDGET_REASON)
			return "handled"
		}

		// set the Scan's start time to now, unless the Scan stopped running after the sweep read the row
		const runningScanIds = await db
			.update(scans)
			.set({ startedAt: new Date() })
			.where(and(eq(scans.id, undispatchedScan.id), eq(scans.status, "running")))
			.returning({ id: scans.id })
		if (runningScanIds.length === 0) {
			return "handled"
		}

		// start the Scan the way its original caller would have
		const scanTrigger = toScanTrigger(undispatchedScan)
		await scanTopic(undispatchedScan, undispatchedScan.topicId as string, undispatchedScan.ownerId, scanTrigger, true)
		return "handled"
	} catch (error) {
		// the row stays undispatched, so the next sweep attempts it again
		console.error(`could not dispatch scan ${undispatchedScan.id}`, error)
		reportError(error, "scheduled-scan", { scanId: undispatchedScan.id })
		return isTemporalTransportFailure(error) ? "unreachable" : "handled"
	}
}

/**
 * Returns the trigger that a Scan row was opened for: manual by hand, creation for a Topic's first scan, and scheduled
 * otherwise.
 */
export function toScanTrigger({ isManual, isFirstScan }: { isManual: boolean; isFirstScan: boolean }): ScanTrigger {
	if (isManual) {
		return "manual"
	}
	return isFirstScan ? "creation" : "scheduled"
}

// what one sweep may start, from its reads of the two scan queues: whether the Scan queue could be read, how many of
// the rows that were never dispatched, and how many scheduled Scans, or null if their queue could not be read
export type ScanDispatchCounts = {
	isScanQueueRead: boolean
	dispatchableScanCount: number
	dispatchableScheduledScanCount: number | null
}

/**
 * Reads and reports both scan queues, and returns how many Scans this sweep may start. The relay of the rows that were
 * never dispatched is sized by the Scan queue's backlog, and the scheduled Scans by their own queue's, so a backlog of
 * first Scans never slows the scheduled ones. A failed read of the Scan queue means a Temporal server out of reach, so
 * the scheduled queue is not read after it, and a scheduled queue that could not be read starts no scheduled Scan.
 */
export async function readScanDispatchCounts(
	readTaskQueue: (taskQueue: string) => Promise<TaskQueueDescription> = describeTaskQueue,
): Promise<ScanDispatchCounts> {
	// the Scan queue, whose failed read leaves the relay its whole limit and stops at the first start that fails
	const scanQueue = await reportScanQueue({ readScanQueue: readTaskQueue })
	const dispatchableScanCount = toDispatchableScanCount(scanQueue)
	if (!scanQueue) {
		return { isScanQueueRead: false, dispatchableScanCount, dispatchableScheduledScanCount: null }
	}

	// the scheduled Scans' own queue
	const scheduledScanQueue = await reportScanQueue({
		taskQueue: SCHEDULED_SCAN_TASK_QUEUE,
		readScanQueue: readTaskQueue,
	})
	return {
		isScanQueueRead: true,
		dispatchableScanCount,
		dispatchableScheduledScanCount: scheduledScanQueue && toDispatchableScanCount(scheduledScanQueue),
	}
}

// one of the two scan queues to report, the Scan queue unless another is named, and how it is read
type ReportScanQueueOptions = {
	taskQueue?: string
	readScanQueue?: (taskQueue: string) => Promise<TaskQueueDescription>
}

/**
 * Reports a scan queue that nothing polls. Returns the queue's description, or null for a failed read.
 */
export async function reportScanQueue({
	taskQueue = SCAN_TASK_QUEUE,
	readScanQueue = describeTaskQueue,
}: ReportScanQueueOptions = {}): Promise<TaskQueueDescription | null> {
	// a failed read is reported, because a Temporal server that the sweep cannot read is one it cannot start a Scan on
	const scanQueue = await readReportedTaskQueue({
		taskQueue,
		readTaskQueue: readScanQueue,
		stage: "scheduled-scan",
		failureMessage: "the sweep could not read a scan task queue",
	})
	if (!scanQueue) {
		return null
	}

	// no poller means no scans of that queue will run
	if (scanQueue.pollerCount === 0) {
		console.error(`no temporal worker is polling the ${taskQueue} queue, so none of its scans will run`)
		reportError(new Error("no temporal worker is polling a scan queue"), "scheduled-scan", { taskQueue })
	}
	return scanQueue
}

/**
 * Reports a film queue that nothing polls, where a published podcast episode's film would wait with no error. Films
 * that are off have no poller, and a failed read is only logged.
 */
export async function reportTopicVideoQueue(
	readTaskQueue: (taskQueue: string) => Promise<TaskQueueDescription> = describeTaskQueue,
): Promise<void> {
	if (topicVideoConcurrency() === 0) {
		return
	}

	// no poller means no film will render
	try {
		const topicVideoQueue = await readTaskQueue(TOPIC_VIDEO_TASK_QUEUE)
		if (topicVideoQueue.pollerCount === 0) {
			console.error("no temporal worker is polling the film queue, so no film will render")
			reportError(new Error("no temporal worker is polling the film queue"), "topic-video", {
				taskQueue: TOPIC_VIDEO_TASK_QUEUE,
			})
		}
	} catch (error) {
		console.error("could not read the film task queue", error)
	}
}

// scans every Topic scheduled by its frequency and emails its new Findings to subscribers.
// whether a Topic is scheduled is computed from its frequency and its Scans, so a sweep is safe to repeat
import { shutdownAnalytics } from "@shared/analytics"
import { reportError, shutdownMonitoring, startMonitoring } from "@shared/monitoring"
import { and, eq, isNotNull, isNull, lt, ne, sql } from "drizzle-orm"
import { db } from "../db"
import { scansRemainingToday } from "../db/quotas"
import { scans, topics } from "../db/schema"
import { scanTopic, startTopicScan } from "./scan"
import { shutdownTelemetry, startTelemetry } from "./telemetry"
import { countScanQueuePollers, SCAN_TASK_QUEUE } from "./temporal-client"
import { MAX_SCAN_DURATION_MS } from "./workflows/stage-timeouts"

// one day in milliseconds, the daily frequency window and the base that the weekly window multiplies
const DAY_MS = 24 * 60 * 60 * 1000

// how long past its stages' own ceiling a dispatched Scan may stay running before it counts as gone.
// derived from the stage timeouts instead of being set alongside them, so raising a timeout cannot start closing out Scans that are slow.
// the environment can still override it
const RECLAIM_MARGIN_MS = 15 * 60 * 1000
const STALE_SCAN_MS = Number(Bun.env.STALE_SCAN_MS ?? String(MAX_SCAN_DURATION_MS + RECLAIM_MARGIN_MS))

/**
 * How long a dispatched Scan may stay running before it counts as failed.
 */
export function staleScanWindowMs(): number {
	return STALE_SCAN_MS
}

// a persisted Topic, and what one topic sweep did: how many Topics were scheduled, started, skipped over quota,
// or could not be started. the sweep hands each Scan to Temporal and does not wait, so it counts starts instead of outcomes.
// how a Scan ended is on its own persisted row, and its failures report from the workflow
type Topic = typeof topics.$inferSelect
export type TopicSweepSummary = { scheduled: number; started: number; skippedOverQuota: number; failed: number }

// a scheduled topic sweep: scan every scheduled Topic under its owner's daily quota, then email its new Findings, isolating failures.
// wrapped with `toExclusiveTask` so a sweep that fires while a sweep is still going is skipped
export const runScheduledTopicScans = toExclusiveTask(async (): Promise<TopicSweepSummary> => {
	// start anything that was opened and never dispatched, then close out anything dispatched that has gone quiet.
	// the first is a recovery, the second a failure, and only the dispatchedAt field tells them apart
	await startUndispatchedScans()
	await failStaleScans()

	// scans run on Temporal, so a queue with no worker behind it means nothing is scanning while every caller still succeeds.
	// the sweep is the one thing that runs on a timer, so it checks whether a reachable server has a worker behind the queue
	await reportUnpolledScanQueue()

	// the Topics scheduled for this sweep, and a summary of what the sweep does for logging
	const scheduledTopics = await loadScheduledTopics()
	const topicSweepSummary: TopicSweepSummary = {
		scheduled: scheduledTopics.length,
		started: 0,
		skippedOverQuota: 0,
		failed: 0,
	}

	// scan each scheduled Topic whose owner still has a quota, then email its subscribers
	for (const topic of scheduledTopics) {
		// skip a Topic whose owner has no daily quota left. it stays scheduled for a later sweep once the quota window rolls over
		if ((await scansRemainingToday(topic.ownerId)) <= 0) {
			topicSweepSummary.skippedOverQuota++
			continue
		}

		// hand the Topic's Scan to Temporal and move on. the workflow both runs the Scan and sends its scan email
		try {
			const scanStart = await startTopicScan(topic.id, topic.ownerId, "scheduled")
			if (scanStart.status === "running") {
				continue
			}
			topicSweepSummary.started++
		} catch (error) {
			// the start itself failed, so no Scan is under way for this Topic. one Topic's failure never stops the sweep
			console.error(`could not start scheduled scan for topic ${topic.id}`, error)
			reportError(error, "scheduled-scan", { topicId: topic.id, ownerId: topic.ownerId })
			topicSweepSummary.failed++
		}
	}

	// a summary line per sweep for the logs
	const { started, skippedOverQuota, failed } = topicSweepSummary
	console.log(
		`scheduled scan sweep: ${started} started, ${skippedOverQuota} over quota, ${failed} could not start, of ${scheduledTopics.length} scheduled`,
	)
	return topicSweepSummary
})

/**
 * Start the temporal workflow for every Scan that was opened but never dispatched.
 * This is the backstop for the gap between writing a Scan row and starting its workflow.
 * an orphaned scan row recovers on the next sweep instead of waiting out a window.
 * A start that the engine refuses means that Scan is already running, and that refusal sets the dispatch marker,
 * so a scan row is only ever retried until it is genuinely dispatched.
 */
async function startUndispatchedScans(): Promise<void> {
	// only rows still open and still attached to a Topic. a Scan that reached a terminal status needs no workflow,
	// and one whose Topic was deleted has nothing left to scan
	const undispatchedScans = await db
		.select()
		.from(scans)
		.where(and(eq(scans.status, "running"), isNull(scans.dispatchedAt), isNotNull(scans.topicId)))
	if (undispatchedScans.length === 0) {
		return
	}

	// one failing Scan never stops the others
	console.log(`dispatching ${undispatchedScans.length} scans that were opened but never started`)

	// the scan row records what it was opened for, so the sweep starts it the way its original caller would have.
	// startedAt is refreshed first, the same way claiming an open scan row does.
	for (const scan of undispatchedScans) {
		try {
			await db.update(scans).set({ startedAt: new Date() }).where(eq(scans.id, scan.id))
			await scanTopic(scan, scan.topicId as string, scan.ownerId, scan.isManual ? "manual" : "scheduled", true)
		} catch (error) {
			// the row stays undispatched, so the next sweep tries it again
			console.error(`could not dispatch scan ${scan.id}`, error)
			reportError(error, "scheduled-scan", { scanId: scan.id })
		}
	}
}

/**
 * Report when nothing is polling the Scan queue
 */
async function reportUnpolledScanQueue(): Promise<void> {
	// this check polls whether a reachable server has a worker behind the queue, so it never fails the sweep itself
	try {
		// no poller means no scans will run
		if ((await countScanQueuePollers()) === 0) {
			console.error("no temporal worker is polling the scan queue, so no scans will run")
			reportError(new Error("no temporal worker is polling the scan queue"), "scheduled-scan", {
				taskQueue: SCAN_TASK_QUEUE,
			})
		}
	} catch (error) {
		console.error("could not read the scan task queue", error)
	}
}

/**
 * Wraps an async task so that a call made while the previous call is still running skips it and resolves to null,
 * instead of starting a second, overlapping run. The guard is in-memory, so it excludes only calls made within this process.
 */
export function toExclusiveTask<Result>(task: () => Promise<Result>): () => Promise<Result | null> {
	// shared by every call the wrapper returns, so calls from different callers still exclude each other
	let isRunning = false
	return async () => {
		// a call made while the task is already running does nothing, instead of overlapping it
		if (isRunning) {
			return null
		}

		// claim the run, and release it however the task ends
		isRunning = true
		try {
			return await task()
		} finally {
			isRunning = false
		}
	}
}

// mark every topic scan that has been running past the stale window as failed, and report how many were closed out.
// a stale topic scan reads as one that is still going, so nothing surfaces to the owner until it is settled
export async function failStaleScans(topicId?: string, now = new Date()): Promise<number> {
	// only a dispatched Scan can be stale. one that was never dispatched has not failed at all, and the sweeper starts it instead.
	const isScanStale = and(
		eq(scans.status, "running"),
		isNotNull(scans.dispatchedAt),
		lt(scans.startedAt, new Date(now.getTime() - STALE_SCAN_MS)),
	)

	// close out the stale scans in one update, returning their ids so the count is what actually changed
	const staleScanIds = await db
		.update(scans)
		.set({ status: "failed", error: "scan stopped responding and was closed out", finishedAt: now })
		.where(topicId ? and(isScanStale, eq(scans.topicId, topicId)) : isScanStale)
		.returning({ id: scans.id })

	// a Scan reaching here was dispatched and then stopped reporting past a window longer than its stages allow,
	// so this is an incident instead of routine cleanup and is reported
	if (staleScanIds.length > 0) {
		console.log(`closed out ${staleScanIds.length} dispatched scans that stopped reporting after ${STALE_SCAN_MS}ms`)
		reportError(new Error(`closed out ${staleScanIds.length} hung scans`), "scheduled-scan", {
			hungScanCount: String(staleScanIds.length),
			...(topicId ? { topicId } : {}),
		})
	}
	return staleScanIds.length
}

// return the Topics scheduled for a scan with this sweep, computed from each Topic's frequency and its most recent Scan
async function loadScheduledTopics(now = new Date()): Promise<Topic[]> {
	// the start of each Topic's most recent finished Scan, counting failed ones. a new Topic has none, so it is due
	const lastScanStarts = await db
		.select({ topicId: scans.topicId, lastStartedAt: sql<string>`max(${scans.startedAt})` })
		.from(scans)
		.where(ne(scans.status, "running"))
		.groupBy(scans.topicId)
	const lastScanStartByTopic = new Map(
		lastScanStarts.map((scanRow) => [scanRow.topicId, new Date(scanRow.lastStartedAt)]),
	)

	// a Topic already scanning is refused by the workflow id when the sweep tries to start it, so it is not filtered out here.
	// a refusal reads the live workflow instead of a topic row, which may be stale
	const topicRows = await db.select().from(topics)
	return topicRows.filter((topicRow) => isTopicScheduled(topicRow, lastScanStartByTopic.get(topicRow.id), now))
}

// a Topic is scheduled when it has no completed Scan, or its last completed Scan is past its frequency window
export function isTopicScheduled(
	topic: Pick<Topic, "frequency">,
	lastCompletedStartedAt: Date | undefined,
	now: Date,
): boolean {
	// a Topic with no completed Scan is always scheduled
	if (!lastCompletedStartedAt) {
		return true
	}

	// a weekdays Topic shares the daily topic's window, but once it has been scanned it skips the weekend
	if (topic.frequency === "weekdays" && isWeekend(now)) {
		return false
	}
	return now.getTime() - lastCompletedStartedAt.getTime() >= frequencyWindowMs(topic.frequency)
}

// how long a Topic's frequency keeps it from re-scanning. daily and weekdays rescan after a day, weekly after a week
export function frequencyWindowMs(frequency: Topic["frequency"]): number {
	return frequency === "weekly" ? 7 * DAY_MS : DAY_MS
}

// Saturday or Sunday, UTC. the app has no per-user timezone yet, so the sweep judges the weekend against the server's own clock
function isWeekend(now: Date): boolean {
	const utcDay = now.getUTCDay()
	return utcDay === 0 || utcDay === 6
}

// run one sweep and exit, so a platform cron can invoke this file on a schedule.
// locally, set SCHEDULE_INTERVAL_MS to keep sweeping on an interval instead of exiting
if (import.meta.main) {
	// trace and monitor the scan path. both no-op without their keys
	startTelemetry()
	startMonitoring()

	// run one sweep now, then keep on looping only if an interval is set
	const intervalMs = Number(Bun.env.SCHEDULE_INTERVAL_MS ?? "0")
	await runScheduledTopicScans()
	if (intervalMs > 0) {
		setInterval(() => {
			runScheduledTopicScans().catch((error) => console.error("scheduled scan sweep failed", error))
		}, intervalMs)
	} else {
		// the cron invocation exits here, so its spans, events, and reports have to be flushed first
		await shutdownTelemetry()
		await shutdownAnalytics()
		await shutdownMonitoring()
	}
}

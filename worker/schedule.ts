// scans every Topic scheduled by its frequency and emails its new Findings to subscribers.
// whether a Topic is scheduled is computed from its frequency and its Scans, so a sweep is safe to repeat
import { shutdownAnalytics } from "@shared/analytics"
import { reportError, shutdownMonitoring, startMonitoring } from "@shared/monitoring"
import { and, eq, lt, ne, sql } from "drizzle-orm"
import { db } from "../db"
import { scansRemainingToday } from "../db/quotas"
import { scans, topics } from "../db/schema"
import { sendTopicScanEmail } from "./notify"
import { runTopicScan } from "./scan"
import { shutdownTelemetry, startTelemetry } from "./telemetry"

// one day in milliseconds, the daily frequency window and the base that the weekly window multiplies
const DAY_MS = 24 * 60 * 60 * 1000

// how long a Scan may stay running before the sweep treats it as hung. the environment can override it.
// a Scan whose process died, or whose model call stalled past its own timeout, would otherwise stay marked running forever
const STALE_SCAN_MS = Number(Bun.env.STALE_SCAN_MS ?? String(30 * 60 * 1000))

// a persisted Topic and Scan, and what one topic sweep did: how many Topics were scheduled, scanned, skipped over quota, or failed
type Topic = typeof topics.$inferSelect
type Scan = typeof scans.$inferSelect
export type TopicSweepSummary = { scheduled: number; scanned: number; skippedOverQuota: number; failed: number }

// a scheduled topic sweep: scan every scheduled Topic under its owner's daily quota, then email its new Findings, isolating failures.
// wrapped with `toExclusiveTask` so an overlapping run is skipped rather than overlapping
export const runScheduledTopicScans = toExclusiveTask(async (): Promise<TopicSweepSummary> => {
	// close out any hung topic scans first, so a Topic stuck mid-scan shows its failure and stops blocking its own next scan
	await failStaleScans()

	// the Topics scheduled for this sweep, and a summary of what the sweep does to each for one summary line
	const scheduledTopics = await loadScheduledTopics()
	const topicSweepSummary: TopicSweepSummary = {
		scheduled: scheduledTopics.length,
		scanned: 0,
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

		// scan the Topic, then email the finished Scan's new Findings. only a succeeded Scan gets emailed
		try {
			const topicScan = await runTopicScan(topic.id, topic.ownerId)
			if (topicScan) {
				await sendTopicScanEmail(topic, topicScan)
			}
			trackSweepOutcome(topicSweepSummary, topicScan)
		} catch (error) {
			// the topic scan threw, so no Scan row came back to inspect. log it, report it, count it, and move on
			console.error(`scheduled scan failed for topic ${topic.id}`, error)
			reportError(error, "scheduled-scan", { topicId: topic.id, ownerId: topic.ownerId })
			topicSweepSummary.failed++
		}
	}

	// a summary line per sweep for the logs
	const { scanned, skippedOverQuota, failed } = topicSweepSummary
	console.log(
		`scheduled scan sweep: ${scanned} scanned, ${skippedOverQuota} over quota, ${failed} failed, of ${scheduledTopics.length} scheduled`,
	)
	return topicSweepSummary
})

/**
 * Wraps an async task so that a call made while the previous call is still running skips it and resolves to null,
 * instead of starting a second, overlapping run. The guard is in-memory, so it excludes only calls made within this process.
 */
export function toExclusiveTask<Result>(task: () => Promise<Result>): () => Promise<Result | null> {
	// shared by every call the wrapper returns, so calls from different callers still exclude each other
	let isRunning = false
	return async () => {
		// a call made while the task is already running does nothing, rather than overlapping it
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
// a hung topic scan reads as one that is still going, so nothing surfaces to the owner until it is settled
export async function failStaleScans(now = new Date()): Promise<number> {
	// close out the hung topic scans in one write, recording why they ended
	const staleScans = await db
		.update(scans)
		.set({ status: "failed", error: "scan stopped responding and was closed out", finishedAt: now })
		.where(and(eq(scans.status, "running"), lt(scans.startedAt, new Date(now.getTime() - STALE_SCAN_MS))))
		.returning({ id: scans.id })

	// a stale Scan is worth a log line, since it means a scan died rather than finished
	if (staleScans.length > 0) {
		console.log(`closed out ${staleScans.length} hung scans still running after ${STALE_SCAN_MS}ms`)
	}
	return staleScans.length
}

// fold one Topic's finished Scan into the sweep summary. a Scan that ended as "failed" is a failure, not a clean pass,
// so a Topic whose sources keep failing shows up in the sweep line
export function trackSweepOutcome(summary: TopicSweepSummary, scan: Pick<Scan, "status"> | undefined): void {
	// a failed topic scan returns normally, so the caller's catch never sees it. count it here
	if (scan?.status === "failed") {
		summary.failed++
		return
	}
	summary.scanned++
}

// return the Topics scheduled for a scan with this sweep, computed from each Topic's frequency and its most recent Scan
async function loadScheduledTopics(now = new Date()): Promise<Topic[]> {
	// the start of each Topic's most recent finished Scan, counting failed ones. a new Topic has none, so it is due
	const latestScans = await db
		.select({ topicId: scans.topicId, lastStartedAt: sql<string>`max(${scans.startedAt})` })
		.from(scans)
		.where(ne(scans.status, "running"))
		.groupBy(scans.topicId)
	const lastStartByTopic = new Map(latestScans.map((row) => [row.topicId, new Date(row.lastStartedAt)]))

	// a Topic whose manual Scan is still in flight is not scheduled.
	// the pending row a new Topic writes at creation is not manual, so it can be scheduled
	const runningManualScans = await db
		.select({ topicId: scans.topicId })
		.from(scans)
		.where(and(eq(scans.status, "running"), eq(scans.isManual, true)))
	const manualScanTopicIds = new Set(runningManualScans.map((row) => row.topicId))

	// only keep Topics whose most recent completed Scan is older than their frequency window
	const topicRows = await db.select().from(topics)
	return topicRows.filter(
		(topicRow) =>
			!manualScanTopicIds.has(topicRow.id) && isTopicScheduled(topicRow, lastStartByTopic.get(topicRow.id), now),
	)
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

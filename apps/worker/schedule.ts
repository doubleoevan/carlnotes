// scans every Topic scheduled by its frequency and emails its new Findings to subscribers

import { SCHEDULED_SCAN_SPENT_BUDGET_REASON } from "@carlnotes/contracts/scanFailure"
import { DAY_MS, isUtcWeekend } from "@carlnotes/contracts/time"
import { db, sizeConnectionPool } from "@carlnotes/db"
import { runWithClaim } from "@carlnotes/db/claim"
import { scansRemainingToday } from "@carlnotes/db/quotas"
import { scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { shutdownTelemetry, startTelemetry } from "@carlnotes/models/telemetry"
import { startTopicScan } from "@carlnotes/pipeline/scan"
import { screenPendingSources } from "@carlnotes/pipeline/screen"
import { failStaleScans } from "@carlnotes/pipeline/staleScans"
import { shutdownAnalytics } from "@carlnotes/server/analytics"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { reportError, shutdownMonitoring, startMonitoring } from "@carlnotes/server/monitoring"
import { and, eq, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm"
import { reportDailySpend } from "./dailySpend"
import { remindOpenReports } from "./reportReminders"
import { retryPendingObjectDeletions } from "./retryPendingObjectDeletions"
import { reportScanQueue, startUndispatchedScans, toDispatchableScanCount } from "./scanQueue"
import { isWithinDailyTopicLimit, loadScheduledTopicLimits } from "./scheduledTopicLimits"
import { syncViewerCounts } from "./syncViewerCounts"

// the sweep's claim, so two sweeps cannot run at once
const TOPIC_SWEEP_CLAIM = "scheduled-scan-sweep"

// a persisted Topic, and what one topic sweep did
export type Topic = typeof topics.$inferSelect
// biome-ignore format: one line keeps the summary's fields under the comment-density hook's limit
export type TopicSweepSummary = { scheduled: number; started: number; skippedOverQuota: number; skippedOverDailyLimit: number; skippedOverDailyScanCutoff: number; skippedOverBudget: number; skippedOverBacklog: number; failed: number }

/**
 * Runs one scheduled sweep under its claim or returns null if another sweep holds the claim.
 * A sweep that loses its claim stops before its next stage or Topic and rejects with a ClaimLostError.
 */
export function runScheduledTopicScans(): Promise<TopicSweepSummary | null> {
	return runWithClaim({ claimName: TOPIC_SWEEP_CLAIM, runTask: sweepScheduledTopics })
}

// one sweep. dispatch what was never started, close out what went quiet, screen new Sources, report the queue,
// then start each scheduled Topic's Scan. each stage first checks that the sweep still holds its claim
async function sweepScheduledTopics(signal: AbortSignal): Promise<TopicSweepSummary> {
	// start anything that was opened and never dispatched, then close out anything dispatched that has gone quiet
	signal.throwIfAborted()
	await startUndispatchedScans()
	signal.throwIfAborted()
	await failStaleScans()

	// a Source row is written before its screen starts
	signal.throwIfAborted()
	await screenPendingSources()

	// report a scan queue that nothing polls, and a backlog past its limit, and size this sweep's dispatch by the backlog
	signal.throwIfAborted()
	const scanQueueDescription = await reportScanQueue()
	const dispatchableScanCount = toDispatchableScanCount(scanQueueDescription)

	// load the scheduled Topics and the limits that their owners' plans and budgets set on them, then start the
	// scheduled Topics' Scans
	signal.throwIfAborted()
	const now = new Date()
	const scheduledTopics = await db.select().from(topics).where(toScheduledTopicFilter(now))
	const scheduledTopicLimits = await loadScheduledTopicLimits(scheduledTopics, now)
	const topicSweepSummary = await startScheduledTopicScans({
		scheduledTopics,
		...scheduledTopicLimits,
		dispatchableScanCount,
		signal,
	})

	// log a summary line for the sweep
	const {
		started,
		skippedOverQuota,
		skippedOverDailyLimit,
		skippedOverDailyScanCutoff,
		skippedOverBudget,
		skippedOverBacklog,
		failed,
	} = topicSweepSummary
	console.log(
		`scheduled scan sweep: ${started} started, ${skippedOverQuota} over quota, ${skippedOverDailyLimit} over the daily topic limit, ${skippedOverDailyScanCutoff} weekly past the daily scans cutoff, ${skippedOverBudget} over budget, ${skippedOverBacklog} left for the next sweep behind the backlog, ${failed} could not start, of ${scheduledTopics.length} scheduled`,
	)
	return topicSweepSummary
}

// the scheduled Topics, the limits from scheduledTopicLimits.ts, how many Scans this sweep may start, unbounded when
// unset, and the signal that the sweep's claim aborts
export type StartScheduledTopicScansOptions = {
	scheduledTopics: Topic[]
	dailyTopicIdsByOwner: Map<string, Set<string>>
	dailyTopicOnWeeklyScanIds?: Set<string>
	budgetExhaustedOwnerIds: Set<string>
	dispatchableScanCount?: number
	signal?: AbortSignal
}

/**
 * Starts a Scan for each scheduled Topic within its owner's quota, daily topic limit, daily scans cutoff, and budget.
 * A Topic whose owner's budget is spent gets a failed Scan instead, unless a Scan of that Topic is still running.
 * Returns what the sweep did. Each owner's remaining scan count is read once and lowered as that owner's Scans start.
 * A sweep whose claim is lost stops before its next Topic.
 */
export async function startScheduledTopicScans({
	scheduledTopics,
	dailyTopicIdsByOwner,
	dailyTopicOnWeeklyScanIds = new Set(),
	budgetExhaustedOwnerIds,
	dispatchableScanCount = Number.POSITIVE_INFINITY,
	signal,
}: StartScheduledTopicScansOptions): Promise<TopicSweepSummary> {
	// what the sweep does, and each owner's remaining scan count, read once per sweep
	const topicSweepSummary = emptyTopicSweepSummary(scheduledTopics.length)
	const remainingScanCountByOwner = new Map<string, number>()

	// start a Scan for each scheduled Topic within its owner's quota, daily topic limit, daily scans cutoff, and budget
	for (const topic of scheduledTopics) {
		// stop once the sweep's claim is lost
		signal?.throwIfAborted()

		// leave a Topic for the next sweep once this sweep has started as many Scans as the backlog allows
		if (topicSweepSummary.started >= dispatchableScanCount) {
			topicSweepSummary.skippedOverBacklog++
			continue
		}

		// read the owner's remaining scan count once and skip a Topic whose owner has no scans left.
		// the Topic stays scheduled for a later sweep
		const remainingScanCount =
			remainingScanCountByOwner.get(topic.ownerId) ?? (await scansRemainingToday(topic.ownerId))
		remainingScanCountByOwner.set(topic.ownerId, remainingScanCount)
		if (remainingScanCount <= 0) {
			topicSweepSummary.skippedOverQuota++
			continue
		}

		// skip a daily Topic past its owner's daily topic limit, or one that runs weekly past its owner's daily scans
		// cutoff and scanned in the past seven days
		const dailyTopicSkip = toDailyTopicSkip(topic, dailyTopicIdsByOwner.get(topic.ownerId), dailyTopicOnWeeklyScanIds)
		if (dailyTopicSkip) {
			topicSweepSummary[dailyTopicSkip]++
			continue
		}

		// a Topic whose owner's budget is spent gets a failed Scan instead of a start, unless one is still running
		if (budgetExhaustedOwnerIds.has(topic.ownerId)) {
			await failTopicOverBudget(topic, topicSweepSummary)
			continue
		}

		// hand the Topic's Scan to Temporal and lower the owner's remaining scan count.
		// a Scan already running spends nothing
		try {
			const scanStart = await startTopicScan(topic.id, topic.ownerId, "scheduled")
			if (scanStart.status === "running") {
				continue
			}
			remainingScanCountByOwner.set(topic.ownerId, remainingScanCount - 1)
			topicSweepSummary.started++
		} catch (error) {
			// the start itself failed, so no Scan is under way for this Topic. one Topic's failure never stops the sweep
			console.error(`could not start scheduled scan for topic ${topic.id}`, error)
			reportError(error, "scheduled-scan", { topicId: topic.id, ownerId: topic.ownerId })
			topicSweepSummary.failed++
		}
	}
	return topicSweepSummary
}

// the summary count that a daily Topic is skipped under, or null if the sweep runs it
function toDailyTopicSkip(
	topic: Topic,
	dailyTopicIds: Set<string> | undefined,
	dailyTopicOnWeeklyScanIds: Set<string>,
): "skippedOverDailyLimit" | "skippedOverDailyScanCutoff" | null {
	if (!isWithinDailyTopicLimit(topic, dailyTopicIds)) {
		return "skippedOverDailyLimit"
	}
	return dailyTopicOnWeeklyScanIds.has(topic.id) ? "skippedOverDailyScanCutoff" : null
}

/**
 * Returns a topic sweep summary of the scheduled Topic count with every outcome count at zero.
 */
export function emptyTopicSweepSummary(scheduledCount: number): TopicSweepSummary {
	return {
		scheduled: scheduledCount,
		started: 0,
		skippedOverQuota: 0,
		skippedOverDailyLimit: 0,
		skippedOverDailyScanCutoff: 0,
		skippedOverBudget: 0,
		skippedOverBacklog: 0,
		failed: 0,
	}
}

// save a failed Scan with the budget reason for a Topic whose owner's budget is spent, unless one of its Scans is running
async function failTopicOverBudget(topic: Topic, topicSweepSummary: TopicSweepSummary): Promise<void> {
	if (await hasRunningScan(topic.id)) {
		return
	}
	await saveFailedScan(topic)
	topicSweepSummary.skippedOverBudget++
}

// whether the Topic has a Scan that is still running
async function hasRunningScan(topicId: string): Promise<boolean> {
	const [runningScan] = await db
		.select({ id: scans.id })
		.from(scans)
		.where(and(eq(scans.topicId, topicId), eq(scans.status, "running")))
		.limit(1)
	return runningScan !== undefined
}

// save a failed Scan for a scheduled Topic whose owner's budget is spent.
// a failed save is reported, and the Topic stays scheduled for the next sweep
async function saveFailedScan(topic: Topic): Promise<void> {
	const now = new Date()
	await db
		.insert(scans)
		.values({
			topicId: topic.id,
			ownerId: topic.ownerId,
			status: "failed",
			error: SCHEDULED_SCAN_SPENT_BUDGET_REASON,
			startedAt: now,
			finishedAt: now,
		})
		.catch((error: unknown) => {
			console.error(`could not save the failed scan for topic ${topic.id}`, error)
			reportError(error, "scheduled-scan", { topicId: topic.id, ownerId: topic.ownerId })
		})
}

/**
 * Returns the filter that selects the Topics scheduled for a Scan now.
 * A Topic is scheduled if it has no completed Scan, or if its last completed Scan is older than its frequency window.
 * A failed Scan counts as completed.
 * A scanned weekdays Topic is never scheduled on a UTC weekend.
 */
export function toScheduledTopicFilter(now: Date): SQL | undefined {
	// the start of each Topic's last completed Scan. a running Scan never spends the frequency window, and neither does
	// a failed Scan that was handed to Temporal but never picked up
	const lastCompletedScanStartedAt = sql`(select max(${scans.startedAt}) from ${scans} where ${scans.topicId} = ${topics.id} and ${scans.status} <> 'running' and not (${scans.status} = 'failed' and ${scans.dispatchedAt} is not null and ${scans.pickedUpAt} is null))`

	// select a Topic never scanned or last scanned longer ago than its frequency window.
	// a scanned weekdays Topic skips the weekend
	const scheduledDailyFrequencies = isUtcWeekend(now) ? ["daily" as const] : ["daily" as const, "weekdays" as const]
	return or(
		isNull(lastCompletedScanStartedAt),
		and(
			eq(topics.frequency, "weekly"),
			lt(lastCompletedScanStartedAt, new Date(now.getTime() - frequencyWindowMs("weekly"))),
		),
		and(
			inArray(topics.frequency, scheduledDailyFrequencies),
			lt(lastCompletedScanStartedAt, new Date(now.getTime() - frequencyWindowMs("daily"))),
		),
	)
}

// how long a Topic's frequency keeps it from re-scanning. daily and weekdays rescan after a day, weekly after a week
export function frequencyWindowMs(frequency: Topic["frequency"]): number {
	return frequency === "weekly" ? 7 * DAY_MS : DAY_MS
}

// run the claimed sweep and the claimed viewer count sync, then retry the pending object deletions, remind the support
// inbox of reports left open, and report the day's spend once the claims are released
async function runSweep(): Promise<void> {
	await runScheduledTopicScans()
	await syncViewerCounts()
	await retryPendingObjectDeletions()
	await remindOpenReports()
	await reportDailySpend()
}

// run one sweep and exit, so a platform cron can invoke this file on a schedule
if (import.meta.main) {
	// monitor, then trace, the scan path, in that order so Langfuse keeps its own provider beside Sentry's.
	// both do nothing without their keys. then size the connection pool from the database
	startMonitoring()
	startTelemetry()
	await sizeConnectionPool()

	// run one sweep now, then keep on looping only if an interval is set
	const intervalMs = toPositiveInteger(Bun.env.SCHEDULE_INTERVAL_MS, 0)
	await runSweep()
	if (intervalMs > 0) {
		setInterval(() => {
			runSweep().catch((error) => console.error("scheduled scan sweep failed", error))
		}, intervalMs)
	} else {
		// the cron invocation exits here, so its spans, events, and reports have to be flushed first
		await shutdownTelemetry()
		await shutdownAnalytics()
		await shutdownMonitoring()
	}
}

// scans every Topic scheduled by its frequency and emails its new Findings to subscribers
import { shutdownAnalytics } from "@shared/analytics"
import { isDailyFrequency } from "@shared/enums"
import { toPositiveInteger } from "@shared/envSettings"
import { reportError, shutdownMonitoring, startMonitoring } from "@shared/monitoring"
import { SCHEDULED_SCAN_SPENT_BUDGET_REASON } from "@shared/scanFailure"
import { DAY_MS } from "@shared/time"
import { and, eq, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm"
import { db, sizeConnectionPool } from "../db"
import { runWithClaim } from "../db/claim"
import { dailyTopicIdsWithinLimit, scansRemainingToday } from "../db/quotas"
import { scans } from "../db/schema/scans"
import { topics } from "../db/schema/topics"
import { runWithConcurrency } from "./concurrency"
import { reportDailySpend } from "./dailySpend"
import { isUserLiteLLMKeyBudgetExhausted } from "./litellm"
import { retryPendingObjectDeletions } from "./retryPendingObjectDeletions"
import { startTopicScan } from "./scan"
import { reportScanQueue, startUndispatchedScans, toDispatchableScanCount } from "./scanQueue"
import { screenPendingSources } from "./screen"
import { failStaleScans } from "./staleScans"
import { shutdownTelemetry, startTelemetry } from "./telemetry"

// how many owners' daily topic allowances the sweep reads at once, and how many owners' key budgets
const DAILY_TOPIC_IDS_LOAD_CONCURRENCY = 8
const OWNER_BUDGET_READ_CONCURRENCY = 8

// the sweep's claim, so two sweeps cannot run at once
const TOPIC_SWEEP_CLAIM = "scheduled-scan-sweep"

// a persisted Topic, and what one topic sweep did
type Topic = typeof topics.$inferSelect
// biome-ignore format: one line keeps the summary's fields under the comment-density hook's limit
export type TopicSweepSummary = { scheduled: number; started: number; skippedOverQuota: number; skippedOverDailyLimit: number; skippedOverBudget: number; skippedOverBacklog: number; failed: number }

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

	// a Source row is written before its llm-guard screen starts
	signal.throwIfAborted()
	await screenPendingSources()

	// report a scan queue that nothing polls, and a backlog past its limit, and size this sweep's dispatch by the backlog
	signal.throwIfAborted()
	const scanQueueDescription = await reportScanQueue()
	const dispatchableScanCount = toDispatchableScanCount(scanQueueDescription)

	// load the scheduled Topics, the daily Topics that each owner's plan still runs,
	// and the owners whose key budget is spent. then start the scheduled Topics' Scans
	signal.throwIfAborted()
	const scheduledTopics = await db.select().from(topics).where(toScheduledTopicFilter(new Date()))
	const [dailyTopicIdsByOwner, budgetExhaustedOwnerIds] = await Promise.all([
		loadDailyTopicIdsByOwner(scheduledTopics),
		loadBudgetExhaustedOwnerIds(scheduledTopics),
	])
	const topicSweepSummary = await startScheduledTopicScans({
		scheduledTopics,
		dailyTopicIdsByOwner,
		budgetExhaustedOwnerIds,
		dispatchableScanCount,
		signal,
	})

	// log a summary line for the sweep
	const { started, skippedOverQuota, skippedOverDailyLimit, skippedOverBudget, skippedOverBacklog, failed } =
		topicSweepSummary
	console.log(
		`scheduled scan sweep: ${started} started, ${skippedOverQuota} over quota, ${skippedOverDailyLimit} over the daily topic limit, ${skippedOverBudget} over budget, ${skippedOverBacklog} left for the next sweep behind the backlog, ${failed} could not start, of ${scheduledTopics.length} scheduled`,
	)
	return topicSweepSummary
}

// the scheduled Topics, the daily Topics that each owner's plan still runs, the owners whose key budget is spent,
// how many Scans this sweep may start, unbounded when unset, and the signal that the sweep's claim aborts
export type StartScheduledTopicScansOptions = {
	scheduledTopics: Topic[]
	dailyTopicIdsByOwner: Map<string, Set<string>>
	budgetExhaustedOwnerIds: Set<string>
	dispatchableScanCount?: number
	signal?: AbortSignal
}

/**
 * Starts a Scan for each scheduled Topic within its owner's quota, daily topic limit, and budget.
 * A Topic whose owner's budget is spent gets a failed Scan instead, unless a Scan of that Topic is still running.
 * Returns what the sweep did. Each owner's remaining scan count is read once and lowered as that owner's Scans start.
 * A sweep whose claim is lost stops before its next Topic.
 */
export async function startScheduledTopicScans({
	scheduledTopics,
	dailyTopicIdsByOwner,
	budgetExhaustedOwnerIds,
	dispatchableScanCount = Number.POSITIVE_INFINITY,
	signal,
}: StartScheduledTopicScansOptions): Promise<TopicSweepSummary> {
	// what the sweep does, and each owner's remaining scan count, read once per sweep
	const topicSweepSummary = emptyTopicSweepSummary(scheduledTopics.length)
	const remainingScanCountByOwner = new Map<string, number>()

	// start a Scan for each scheduled Topic within its owner's quota, daily topic limit, and budget
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

		// skip a daily Topic past its owner's daily topic limit
		if (!isWithinDailyTopicLimit(topic, dailyTopicIdsByOwner.get(topic.ownerId))) {
			topicSweepSummary.skippedOverDailyLimit++
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

/**
 * Returns a topic sweep summary of the scheduled Topic count with every outcome count at zero.
 */
export function emptyTopicSweepSummary(scheduledCount: number): TopicSweepSummary {
	return {
		scheduled: scheduledCount,
		started: 0,
		skippedOverQuota: 0,
		skippedOverDailyLimit: 0,
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
 * Whether the sweep still runs this Topic under its owner's daily topic limit. A Topic on a weekly frequency
 * draws on no daily allowance at all, so the limit never touches it.
 */
export function isWithinDailyTopicLimit(
	topic: Pick<Topic, "id" | "frequency">,
	ownerDailyTopicIds: Set<string> | undefined,
): boolean {
	return !isDailyFrequency(topic.frequency) || Boolean(ownerDailyTopicIds?.has(topic.id))
}

// the daily Topics that each owner's plan can run, keyed by the owner for reuse
async function loadDailyTopicIdsByOwner(scheduledTopics: Topic[]): Promise<Map<string, Set<string>>> {
	const dailyTopics = scheduledTopics.filter((topic) => isDailyFrequency(topic.frequency))
	const ownerIds = [...new Set(dailyTopics.map((topic) => topic.ownerId))]
	const dailyTopicIdsByOwnerEntries = await runWithConcurrency(
		ownerIds,
		DAILY_TOPIC_IDS_LOAD_CONCURRENCY,
		async (ownerId): Promise<[string, Set<string>]> => [ownerId, await dailyTopicIdsWithinLimit(ownerId)],
	)
	return new Map(dailyTopicIdsByOwnerEntries)
}

/**
 * Returns the ids of the scheduled Topics' owners whose key budget is spent, reading each owner's budget once.
 * An owner who has no key, or whose budget read fails, is left out.
 */
export async function loadBudgetExhaustedOwnerIds(scheduledTopics: Pick<Topic, "ownerId">[]): Promise<Set<string>> {
	// read each distinct owner's budget.
	// a read that throws an error is reported, and that owner's budget counts as not spent
	const ownerIds = [...new Set(scheduledTopics.map((topic) => topic.ownerId))]
	const isUserLiteLLMKeyBudgetExhaustedResults = await runWithConcurrency(
		ownerIds,
		OWNER_BUDGET_READ_CONCURRENCY,
		(ownerId) =>
			isUserLiteLLMKeyBudgetExhausted(ownerId).catch((error: unknown) => {
				console.error(`could not read the key budget for owner ${ownerId}`, error)
				reportError(error, "scheduled-scan", { ownerId })
				return false
			}),
	)
	return new Set(ownerIds.filter((_ownerId, i) => isUserLiteLLMKeyBudgetExhaustedResults[i]))
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
	const scheduledDailyFrequencies = isWeekend(now) ? ["daily" as const] : ["daily" as const, "weekdays" as const]
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

// Saturday or Sunday, UTC
function isWeekend(now: Date): boolean {
	const utcDay = now.getUTCDay()
	return utcDay === 0 || utcDay === 6
}

// run the claimed sweep, then retry the pending object deletions and report the day's spend once the claim is released
async function runSweep(): Promise<void> {
	await runScheduledTopicScans()
	await retryPendingObjectDeletions()
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

// scans every Topic scheduled by its frequency and emails its new Findings to subscribers
import { shutdownAnalytics } from "@shared/analytics"
import { isDailyFrequency } from "@shared/enums"
import { reportError, reportThresholdCrossing, shutdownMonitoring, startMonitoring } from "@shared/monitoring"
import { and, eq, inArray, isNotNull, isNull, lt, or, type SQL, sql } from "drizzle-orm"
import { db } from "../db"
import { runWithClaim } from "../db/claim"
import { dailyTopicIdsWithinLimit, scansRemainingToday } from "../db/quotas"
import { scans, topics } from "../db/schema"
import { runWithConcurrency } from "./concurrency"
import { scanTopic, startTopicScan } from "./scan"
import { screenPendingSources } from "./screen"
import { shutdownTelemetry, startTelemetry } from "./telemetry"
import { describeScanQueue, SCAN_TASK_QUEUE, type ScanQueueDescription, toScanBacklogCrossing } from "./temporal-client"
import { FINISH_TOTAL_TIMEOUT_MS, INGEST_TOTAL_TIMEOUT_MS, MAX_SCAN_DURATION_MS } from "./workflows/stage-timeouts"

// one day in milliseconds, the daily frequency window and the base that the weekly window multiplies
const DAY_MS = 24 * 60 * 60 * 1000

// how long a picked-up Scan may stay running past its stages' own limit before it counts as gone
const STALE_SCAN_MARGIN_MS = 15 * 60 * 1000
const STALE_SCAN_MS = Number(Bun.env.STALE_SCAN_MS ?? String(MAX_SCAN_DURATION_MS + STALE_SCAN_MARGIN_MS))

// how long a dispatched Scan that no worker has picked up may wait for a slot before it counts as gone.
// Temporal counts queue time against the ingest stage's schedule-to-close timeout, and the finish stage waits behind the same backlog
const STALE_DISPATCH_MS = INGEST_TOTAL_TIMEOUT_MS + FINISH_TOTAL_TIMEOUT_MS + STALE_SCAN_MARGIN_MS

// how many owners' daily topic allowances the sweep reads at once
const DAILY_TOPIC_IDS_LOAD_CONCURRENCY = 8

// the sweep's claim, so two sweeps cannot run at once
const TOPIC_SWEEP_CLAIM = "scheduled-scan-sweep"

// the failure reasons that a closed-out Scan records, for a picked-up Scan and for a Scan that no worker picked up
const STALE_SCAN_REASON = "scan stopped responding and was closed out"
const STALE_DISPATCH_REASON = "scan waited too long to start and was closed out"

/**
 * Returns how long a picked-up Scan may stay running before it counts as failed.
 */
export function staleScanWindowMs(): number {
	return STALE_SCAN_MS
}

// a persisted Topic, and what one topic sweep did
type Topic = typeof topics.$inferSelect
// biome-ignore format: one line keeps the summary's fields under the comment-density hook's limit
export type TopicSweepSummary = { scheduled: number; started: number; skippedOverQuota: number; skippedOverDailyLimit: number; failed: number }

/**
 * Runs one scheduled sweep under its claim or returns null if another sweep holds the claim.
 */
export function runScheduledTopicScans(): Promise<TopicSweepSummary | null> {
	return runWithClaim({ claimName: TOPIC_SWEEP_CLAIM, runTask: sweepScheduledTopics })
}

// one sweep. dispatch what was never started, close out what went quiet, screen new Sources, report the queue,
// then start each scheduled Topic's Scan
async function sweepScheduledTopics(): Promise<TopicSweepSummary> {
	// start anything that was opened and never dispatched, then close out anything dispatched that has gone quiet
	await startUndispatchedScans()
	await failStaleScans()

	// a Source row is written before its llm-guard screen starts
	await screenPendingSources()

	// report a scan queue that nothing polls, and a backlog past its limit
	await reportScanQueue()

	// load the scheduled Topics and which of each owner's daily Topics their plan still runs,
	// then start the scheduled Topics' Scans
	const scheduledTopics = await db.select().from(topics).where(toScheduledTopicFilter(new Date()))
	const dailyTopicIdsByOwner = await loadDailyTopicIdsByOwner(scheduledTopics)
	const topicSweepSummary = await startScheduledTopicScans({ scheduledTopics, dailyTopicIdsByOwner })

	// log a summary line for the sweep
	const { started, skippedOverQuota, skippedOverDailyLimit, failed } = topicSweepSummary
	console.log(
		`scheduled scan sweep: ${started} started, ${skippedOverQuota} over quota, ${skippedOverDailyLimit} over the daily topic limit, ${failed} could not start, of ${scheduledTopics.length} scheduled`,
	)
	return topicSweepSummary
}

// the scheduled Topics, and the daily Topics that each owner's plan still runs
export type StartScheduledTopicScansOptions = {
	scheduledTopics: Topic[]
	dailyTopicIdsByOwner: Map<string, Set<string>>
}

/**
 * Starts a Scan for each scheduled Topic within its owner's quota and daily topic limit and returns what the sweep did.
 * Each owner's remaining scan count is read once and lowered as that owner's Scans start.
 */
export async function startScheduledTopicScans({
	scheduledTopics,
	dailyTopicIdsByOwner,
}: StartScheduledTopicScansOptions): Promise<TopicSweepSummary> {
	// what the sweep does, and each owner's remaining scan count, read once per sweep
	const topicSweepSummary: TopicSweepSummary = {
		scheduled: scheduledTopics.length,
		started: 0,
		skippedOverQuota: 0,
		skippedOverDailyLimit: 0,
		failed: 0,
	}
	const remainingScanCountByOwner = new Map<string, number>()

	// start a Scan for each scheduled Topic within its owner's quota and daily topic limit
	for (const topic of scheduledTopics) {
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
 * Start the temporal workflow for every Scan that was opened but never dispatched.
 * This is the backstop for the gap between writing a Scan row and starting its workflow.
 * an orphaned scan row recovers on the next sweep instead of waiting out a window.
 * A start that the engine rejects means that Scan is already running, and that rejection sets the dispatch marker,
 * so a scan row is only ever retried until it is genuinely dispatched.
 */
async function startUndispatchedScans(): Promise<void> {
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
			await db.update(scans).set({ startedAt: new Date() }).where(eq(scans.id, scan.id))
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
 * A failed read is logged and never fails the sweep.
 */
export async function reportScanQueue(
	readScanQueue: () => Promise<ScanQueueDescription> = describeScanQueue,
): Promise<void> {
	// a failed read is logged, and the sweep goes on
	let scanQueue: ScanQueueDescription
	try {
		scanQueue = await readScanQueue()
	} catch (error) {
		console.error("could not read the scan task queue", error)
		return
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
 * Returns the filter that selects the Topics scheduled for a Scan now.
 * A Topic is scheduled if it has no completed Scan, or if its last completed Scan is older than its frequency window.
 * A failed Scan counts as completed.
 * A scanned weekdays Topic is never scheduled on a UTC weekend.
 */
export function toScheduledTopicFilter(now: Date): SQL | undefined {
	// the start of each Topic's last completed Scan. a running Scan never spends the frequency window
	const lastCompletedScanStartedAt = sql`(select max(${scans.startedAt}) from ${scans} where ${scans.topicId} = ${topics.id} and ${scans.status} <> 'running')`

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

// run one sweep and exit, so a platform cron can invoke this file on a schedule
if (import.meta.main) {
	// monitor, then trace, the scan path, in that order so Langfuse keeps its own provider beside Sentry's.
	// both do nothing without their keys
	startMonitoring()
	startTelemetry()

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

// the scheduled Topics' Scan starts, a page at a time, within each owner's quota, daily limits, and budget

import { SCHEDULED_SCAN_SPENT_BUDGET_REASON } from "@carlnotes/contracts/scanFailure"
import { db } from "@carlnotes/db"
import type { DailySpendCutoffState } from "@carlnotes/db/dailySpendCutoffs"
import { scansRemainingToday } from "@carlnotes/db/quotas"
import { scans } from "@carlnotes/db/schema/scans"
import type { topics } from "@carlnotes/db/schema/topics"
import { clearStatusReads } from "@carlnotes/db/statusReadCaches"
import { startTopicScan } from "@carlnotes/pipeline/scan"
import { isTemporalTransportFailure } from "@carlnotes/pipeline/temporalClient"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq } from "drizzle-orm"
import { isWithinDailyTopicLimit, loadDailySpendCutoffOwnerIds, loadScheduledTopicLimits } from "./scheduledTopicLimits"
import { loadScheduledTopicIds, loadScheduledTopics } from "./scheduledTopicPages"

// a persisted Topic, and what one topic sweep did
export type Topic = typeof topics.$inferSelect
// biome-ignore format: one line keeps the summary's fields under the comment-density hook's limit
export type TopicSweepSummary = { scheduled: number; started: number; skippedWaitingScan: number; skippedOverDailySpendCutoff: number; skippedOverQuota: number; skippedOverDailyLimit: number; skippedOverDailyScanCutoff: number; skippedOverBudget: number; skippedOverBacklog: number; skippedTemporalOutage: number; failed: number }

// the fewest and the most Topics that one page holds. a page is as long as the Scans the sweep may still start, so an
// owner's limits are read only for Topics the sweep can reach, within these bounds: the lower one keeps a sweep with a
// few starts left from reading a long run of Topics it has to skip a few at a time
const MIN_SCHEDULED_TOPIC_PAGE_SIZE = 20
const MAX_SCHEDULED_TOPIC_PAGE_SIZE = 200

// the moment the sweep reads at, the cutoff state the sweep read, the Topics whose Scan still waits, how many Scans
// this sweep may start, or null if the scheduled queue could not be read, and the signal that the sweep's lease aborts
type StartScheduledTopicScanPagesOptions = {
	now: Date
	cutoffState: DailySpendCutoffState
	waitingScanTopicIds: Set<string>
	dispatchableScanCount: number | null
	signal: AbortSignal
}

/**
 * Starts the scheduled Topics' Scans a page at a time, the Topic whose last completed Scan is oldest first, until the
 * sweep has started as many Scans as it may or no scheduled Topic is left, and returns what the sweep did. The limits
 * that the owners' plans and budgets set are read for one page's Topics at a time, so a sweep that may start a
 * hundred Scans reads no limit for the thousands of Topics behind them. A queue that could not be read means a
 * Temporal server that a start would not reach either, so that sweep starts none and every Topic stays scheduled.
 */
export async function startScheduledTopicScanPages({
	now,
	cutoffState,
	dispatchableScanCount,
	...startOptions
}: StartScheduledTopicScanPagesOptions): Promise<TopicSweepSummary> {
	// read the scheduled Topics' ids once in sweep order, count them for the summary, and leave them all if the queue
	// could not be read
	const scheduledTopicIds = await loadScheduledTopicIds(now)
	const topicSweepSummary = emptyTopicSweepSummary(scheduledTopicIds.length)
	if (dispatchableScanCount === null) {
		return { ...topicSweepSummary, skippedTemporalOutage: topicSweepSummary.scheduled }
	}

	// each owner's remaining scan count is read once across the pages
	const remainingScanCountByOwner = new Map<string, number>()
	let readTopicCount = 0
	while (topicSweepSummary.started < dispatchableScanCount && readTopicCount < scheduledTopicIds.length) {
		// read as many Topics as the sweep may still start, within the page's bounds
		const remainingStartCount = dispatchableScanCount - topicSweepSummary.started
		const limit = Math.min(Math.max(remainingStartCount, MIN_SCHEDULED_TOPIC_PAGE_SIZE), MAX_SCHEDULED_TOPIC_PAGE_SIZE)
		const pageTopicIds = scheduledTopicIds.slice(readTopicCount, readTopicCount + limit)
		const scheduledTopics = await loadScheduledTopics(pageTopicIds)
		readTopicCount += pageTopicIds.length

		// load the limits of this page's owners, and the owners past the scheduled scans cutoff, then start its Scans
		const scheduledTopicLimits = await loadScheduledTopicLimits(scheduledTopics, now)
		const dailySpendCutoffOwnerIds = await loadDailySpendCutoffOwnerIds(scheduledTopics, cutoffState)
		const { topicSweepSummary: pageSummary, isTemporalUnreachable } = await startScheduledTopicPage({
			scheduledTopics,
			...scheduledTopicLimits,
			dailySpendCutoffOwnerIds,
			dispatchableScanCount: remainingStartCount,
			remainingScanCountByOwner,
			...startOptions,
		})
		addTopicSweepCounts(topicSweepSummary, pageSummary)

		// a Temporal server that could not be reached leaves every Topic after the failed start, read or not
		if (isTemporalUnreachable) {
			topicSweepSummary.skippedTemporalOutage += Math.max(topicSweepSummary.scheduled - readTopicCount, 0)
			return topicSweepSummary
		}
	}

	// if the sweep started as many Scans as it may, the Topics it never read stay scheduled behind the backlog
	topicSweepSummary.skippedOverBacklog += Math.max(topicSweepSummary.scheduled - readTopicCount, 0)
	return topicSweepSummary
}

// add one page's outcome counts to the sweep's. the scheduled count is the sweep's own
function addTopicSweepCounts(topicSweepSummary: TopicSweepSummary, pageSummary: TopicSweepSummary): void {
	for (const outcome of Object.keys(pageSummary) as (keyof TopicSweepSummary)[]) {
		if (outcome !== "scheduled") {
			topicSweepSummary[outcome] += pageSummary[outcome]
		}
	}
}

// the scheduled Topics, the limits from scheduledTopicLimits.ts, the Topics whose Scan still waits, the owners past the
// scheduled scans cutoff, how many Scans this page may start, and the signal that the sweep's lease aborts
export type StartScheduledTopicPageOptions = {
	scheduledTopics: Topic[]
	dailyTopicIdsByOwner: Map<string, Set<string>>
	dailyTopicOnWeeklyScanIds: Set<string>
	budgetExhaustedOwnerIds: Set<string>
	// the Topics whose Scan still waits, and the owners past the scheduled scans cutoff
	waitingScanTopicIds: Set<string>
	dailySpendCutoffOwnerIds: Set<string>
	dispatchableScanCount: number
	// each owner's remaining scan count, which a sweep that starts its Topics a page at a time shares across its pages
	remainingScanCountByOwner: Map<string, number>
	signal: AbortSignal
}

// what starting one page of scheduled Topics did, and whether a start could not reach the Temporal server, which
// ends the sweep's starts
type ScheduledTopicPageStart = { topicSweepSummary: TopicSweepSummary; isTemporalUnreachable: boolean }

/**
 * Starts a Scan for each of one page's scheduled Topics within its owner's quota, daily topic limit, daily scans
 * cutoff, and budget. A Topic whose Scan still waits, or whose owner is past the scheduled scans cutoff, writes no row
 * and stays scheduled. A Topic whose owner's budget is spent gets a failed Scan instead, unless a Scan of that Topic is
 * still running. Returns what the page did. Each owner's remaining scan count is read once and lowered as that owner's
 * Scans start. A start that cannot reach the Temporal server ends the starts, and the Topics after it stay scheduled.
 * A sweep whose lease is lost stops before its next Topic.
 */
export async function startScheduledTopicPage({
	scheduledTopics,
	dailyTopicIdsByOwner,
	dailyTopicOnWeeklyScanIds,
	budgetExhaustedOwnerIds,
	waitingScanTopicIds,
	dailySpendCutoffOwnerIds,
	dispatchableScanCount,
	remainingScanCountByOwner,
	signal,
}: StartScheduledTopicPageOptions): Promise<ScheduledTopicPageStart> {
	// what the sweep does. each owner's remaining scan count is read once per sweep
	const topicSweepSummary = emptyTopicSweepSummary(scheduledTopics.length)

	// start a Scan for each scheduled Topic within its owner's quota, daily topic limit, daily scans cutoff, and budget
	for (const [topicIndex, topic] of scheduledTopics.entries()) {
		// stop once the sweep's lease is lost
		signal.throwIfAborted()

		// leave a Topic whose Scan still waits, or whose owner is past the scheduled scans cutoff, before any quota read
		const dailySpendSkip = toDailySpendSkip(topic, waitingScanTopicIds, dailySpendCutoffOwnerIds)
		if (dailySpendSkip) {
			topicSweepSummary[dailySpendSkip]++
			continue
		}

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

		// hand the Topic's Scan to Temporal
		switch (await startScheduledTopicScan(topic, topicSweepSummary)) {
			// a new Scan lowers the owner's remaining scan count
			case "started":
				remainingScanCountByOwner.set(topic.ownerId, remainingScanCount - 1)
				break
			// a Temporal server that cannot be reached fails every later start the same way, each after its own deadline,
			// so the Topics after this one stay scheduled for the next sweep
			case "unreachable":
				topicSweepSummary.skippedTemporalOutage = scheduledTopics.length - topicIndex - 1
				return { topicSweepSummary, isTemporalUnreachable: true }
		}
	}
	return { topicSweepSummary, isTemporalUnreachable: false }
}

// how one scheduled Topic's start ended: a new Scan started, one was already running, the start failed, or the start
// could not reach the Temporal server
type ScheduledScanStart = "started" | "running" | "failed" | "unreachable"

// start one scheduled Topic's Scan and count it, returning how the start ended.
// a Scan already running spends nothing, and a failed start is counted and reported
async function startScheduledTopicScan(
	topic: Topic,
	topicSweepSummary: TopicSweepSummary,
): Promise<ScheduledScanStart> {
	try {
		// start the Scan, unless one is already running
		const scanStart = await startTopicScan(topic.id, topic.ownerId, "scheduled")
		if (scanStart.status === "running") {
			return "running"
		}

		// count the new Scan
		topicSweepSummary.started++
		return "started"
	} catch (error) {
		// the start itself failed, so no Scan is under way for this Topic. one Topic's failure never stops the sweep,
		// unless the failure is a Temporal server that cannot be reached
		console.error(`could not start scheduled scan for topic ${topic.id}`, error)
		reportError(error, "scheduled-scan", { topicId: topic.id, ownerId: topic.ownerId })
		topicSweepSummary.failed++
		return isTemporalTransportFailure(error) ? "unreachable" : "failed"
	}
}

// the summary count that a Topic is skipped under if its Scan still waits or its owner is past the scheduled scans
// cutoff, or null
function toDailySpendSkip(
	topic: Topic,
	waitingScanTopicIds: Set<string>,
	dailySpendCutoffOwnerIds: Set<string>,
): "skippedWaitingScan" | "skippedOverDailySpendCutoff" | null {
	if (waitingScanTopicIds.has(topic.id)) {
		return "skippedWaitingScan"
	}
	return dailySpendCutoffOwnerIds.has(topic.ownerId) ? "skippedOverDailySpendCutoff" : null
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
		skippedWaitingScan: 0,
		skippedOverDailySpendCutoff: 0,
		skippedOverQuota: 0,
		skippedOverDailyLimit: 0,
		skippedOverDailyScanCutoff: 0,
		skippedOverBudget: 0,
		skippedOverBacklog: 0,
		skippedTemporalOutage: 0,
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

// save a failed Scan for a scheduled Topic whose owner's budget is spent, and clear the Topic's scan status copy.
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
	await clearStatusReads("scan", topic.id)
}

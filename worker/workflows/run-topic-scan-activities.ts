// the Scan pipeline as three activities: ingest, review, and the write that completes the Scan
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing"
import { trackEvent } from "@shared/analytics"
import { asyncLocalStorage } from "@temporalio/activity"
import { and, count, eq, isNull } from "drizzle-orm"
import { db } from "../../db"
import { findings, scans, topics, users } from "../../db/schema"
import { type Budget, newBudget, toResumedBudget } from "../budget"
import type { SourceOutcome } from "../ingest"
import { ingestFromTopicSources } from "../ingest"
import type { NewResource } from "../ingest/ingester"
import { sendManualScanEmail, sendTopicScanEmail } from "../notify"
import type { ReviewSummary } from "../review"
import { reviewScan } from "../review"
import { HEARTBEAT_INTERVAL_MS } from "./stage-timeouts"

// a persisted Scan row, and the aggregate that ingest hands to review
type Scan = typeof scans.$inferSelect

// what asked for this Scan, which decides what its end announces
export type ScanTrigger = "manual" | "scheduled" | "creation"

// what ingest leaves for the stages after it
export type IngestStageResult = {
	resources: NewResource[]
	foundCount: number
	status: Scan["status"]
	problemSources: Scan["problemSources"]
	sourceOutcomes: SourceOutcome[]
	budget: Budget
}

// what review leaves for the write that completes the Scan
export type ReviewStageResult = { review: ReviewSummary; budget: Budget }

/**
 * Ingest every Source on the Topic and store what they turned up. Safe to run again: Resources dedupe on canonical url,
 * so a second ingest attempt reaches the same set of resources instead of ingesting again.
 */
export async function ingestForScan(scanId: string, topicId: string): Promise<IngestStageResult> {
	// the Budget is made here instead of in the workflow
	const budget = toStageBudget(newBudget())
	return traceScanStage("scan-ingest", scanId, topicId, () =>
		withHeartbeat(budget, async () => {
			// every later stage charges into the budget this returns ingestion runs every Source at once
			const { sourceOutcomes, summary } = await ingestFromTopicSources(topicId, budget)
			await recordScanProgress(scanId, budget)
			// drop the fetched page bodies before the result crosses the activity boundary
			return {
				resources: summary.resources.map(({ fetchedBody, ...resource }) => resource),
				foundCount: summary.foundCount,
				status: summary.status,
				problemSources: summary.problemSources,
				sourceOutcomes,
				budget,
			}
		}),
	)
}

/**
 * Review what ingest found, paying for the fetches and the model calls the judgment needs.
 * A second attempt skips every Resource the first one already scored, and resumes with what it spent.
 */
export async function reviewForScan(
	scanId: string,
	topicId: string,
	ownerId: string,
	ingested: IngestStageResult,
	budget: Budget,
): Promise<ReviewStageResult> {
	// what the last attempt had spent when it died, or what ingestion handed over on the first attempt
	const stageBudget = toStageBudget(budget)
	return traceScanStage("scan-review", scanId, topicId, () =>
		withHeartbeat(stageBudget, async () => {
			// the Scan row and the owner's LiteLLM proxy key
			const scan = await requireScan(scanId)
			const [owner] = await db
				.select({ litellmVirtualKey: users.litellmVirtualKey })
				.from(users)
				.where(eq(users.id, ownerId))

			const review = await reviewScan(
				scan,
				topicId,
				ingested.resources,
				ingested.sourceOutcomes,
				stageBudget,
				owner?.litellmVirtualKey ?? undefined,
				stopSignal(),
			)
			await recordScanProgress(scanId, stageBudget)
			return { review, budget: stageBudget }
		}),
	)
}

/**
 * Finish the Scan by storing its counts and cost, then email the owner or the subscribers.
 */
export async function finishScan(
	scanId: string,
	topicId: string,
	ownerId: string,
	trigger: ScanTrigger,
	ingested: IngestStageResult,
	reviewed: ReviewStageResult,
): Promise<void> {
	const { review, budget } = reviewed

	// what the Scan kept, counted from its own Findings instead of from the review
	const [keptRow] = await db.select({ count: count() }).from(findings).where(eq(findings.scanId, scanId))

	// the write completes the Scan: what ingestion found, what review kept, the per-stage costs, and the total
	const [finishedScan] = await db
		.update(scans)
		.set({
			status: ingested.status,
			foundCount: ingested.foundCount,
			problemSources: ingested.problemSources,
			keptCount: keptRow?.count ?? review.keptCount,
			filteredCount: review.filteredCount,
			stageCosts: budget.stageCosts,
			scanSummary: review.scanSummary,
			reused: budget.fetchCounts.reusedCount,
			revalidated: budget.fetchCounts.revalidatedCount,
			fetched: budget.fetchCounts.fetchedCount,
			cost: budget.spentDollars.toString(),
			finishedAt: new Date(),
			// the sweep that marks a hung Scan failed writes its reason here, so a Scan that finishes afterward clears it
			error: null,
		})
		.where(eq(scans.id, scanId))
		.returning()
	if (!finishedScan) {
		return
	}

	// the topic owner's plan tracks the analytics event for a first scan
	const [topicOwner] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, ownerId))
	if (ingested.status === "succeeded" && (await isFirstSucceededScan(ownerId))) {
		trackEvent("first_scan_completed", ownerId, { plan: topicOwner?.plan ?? "free", topicId })
	}

	// a manual or creation Scan reports back to whoever fired it
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return
	}

	// whoever triggered a manual scan is emailed, and a scheduled Scan goes to the Topic's subscribers instead
	if (trigger === "creation" || trigger === "manual") {
		await sendManualScanEmail(ownerId, topic, finishedScan)
		return
	}
	await sendTopicScanEmail(topic, finishedScan)
}

/**
 * Close a Scan the user stopped, keeping what it managed to keep. It saves as succeeded instead of failed,
 * because its Findings are real and its cost is owed. The stoppedAt timestamp is what gives its daily scan back
 * and what tells the topic page it was stopped.
 * Nothing is emailed: a manual Scan reports to the page whoever stopped it is watching, and a scheduled
 * one sends no digest for a Topic read only part way.
 * The spend is left as each stage recorded it. A cancelled stage's own totals never reach the workflow.
 */
export async function stopScan(scanId: string): Promise<void> {
	// the Scan saves the moment the stop arrives, while its cancelled stage is still winding down
	await db
		.update(scans)
		.set({ status: "succeeded", stoppedAt: new Date(), finishedAt: new Date() })
		.where(and(eq(scans.id, scanId), isNull(scans.finishedAt)))
}

/**
 * Record what a stage spent and what the Scan has kept, as that stage ends. A Scan that runs to the end overwrites
 * this with its final totals, but a Scan the user stops never gets that far: the workflow drops its cancelled stage's
 * return value, and saves the row before the stage has finished. Saving from inside the stage is what
 * gets the real spend and the real kept count onto a stopped Scan.
 */
async function recordScanProgress(scanId: string, budget: Budget): Promise<void> {
	// the Findings are the count, the same source a Scan that runs to the end counts from
	const [keptRow] = await db.select({ count: count() }).from(findings).where(eq(findings.scanId, scanId))
	await db
		.update(scans)
		.set({
			keptCount: keptRow?.count ?? 0,
			stageCosts: budget.stageCosts,
			cost: budget.spentDollars.toString(),
			reused: budget.fetchCounts.reusedCount,
			revalidated: budget.fetchCounts.revalidatedCount,
			fetched: budget.fetchCounts.fetchedCount,
		})
		.where(eq(scans.id, scanId))
}

/**
 * Record a Scan as failed along with what it had already spent, for a workflow whose stage threw an error.
 */
export async function failScan(scanId: string, reason: string, budget?: Budget): Promise<void> {
	// a Scan that failed before its first stage returned has no spend to record
	const spend = budget ? { stageCosts: budget.stageCosts, cost: budget.spentDollars.toString() } : {}
	await db
		.update(scans)
		.set({ status: "failed", error: reason, finishedAt: new Date(), ...spend })
		.where(eq(scans.id, scanId))
}

// report that this worker is alive for as long as the stage runs, and checkpoint the Budget as what it reports
function withHeartbeat<Result>(budget: Budget, runStage: () => Promise<Result>): Promise<Result> {
	const activityContext = asyncLocalStorage.getStore()
	const heartbeatPump = setInterval(() => activityContext?.heartbeat(budget), HEARTBEAT_INTERVAL_MS)
	return runStage().finally(() => clearInterval(heartbeatPump))
}

// the signal that aborts when the user stops the Scan
function stopSignal(): AbortSignal | undefined {
	return asyncLocalStorage.getStore()?.cancellationSignal
}

// the Budget this attempt runs against
function toStageBudget(passedBudget: Budget): Budget {
	return toResumedBudget(asyncLocalStorage.getStore()?.info.heartbeatDetails, passedBudget)
}

// one llm trace per stage
function traceScanStage<Result>(
	stage: string,
	scanId: string,
	topicId: string,
	runStage: () => Promise<Result>,
): Promise<Result> {
	return propagateAttributes({ traceName: stage, metadata: { topicId, scanId } }, () =>
		startActiveObservation(stage, runStage),
	)
}

// the Scan row this workflow is running, read fresh instead of being passed across a stage
async function requireScan(scanId: string): Promise<Scan> {
	const [scan] = await db.select().from(scans).where(eq(scans.id, scanId))
	if (!scan) {
		throw new Error(`scan ${scanId} no longer exists`)
	}
	return scan
}

// whether the Scan that just finished is this owner's first Scan to succeed
async function isFirstSucceededScan(ownerId: string): Promise<boolean> {
	const [scanCountRow] = await db
		.select({ count: count() })
		.from(scans)
		.where(and(eq(scans.ownerId, ownerId), eq(scans.status, "succeeded")))
	return scanCountRow?.count === 1
}

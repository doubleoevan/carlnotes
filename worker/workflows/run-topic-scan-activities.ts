// the Scan pipeline as three activities: ingest, review, and the write that completes the Scan.
// each stage takes and returns plain data, since Temporal serializes what crosses an activity boundary,
// and the Scan row is loaded by id instead of being included, so a stage reads the Scan row as it stands
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing"
import { trackEvent } from "@shared/analytics"
import { asyncLocalStorage } from "@temporalio/activity"
import { and, count, eq } from "drizzle-orm"
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

// what asked for this Scan, which decides what its end announces. a manual Scan emails whoever fired it,
// a scheduled one sends the Topic's scan email to its subscribers
export type ScanTrigger = "manual" | "scheduled" | "creation"

// what ingest leaves for the stages after it: the Resources it stored, the per-Source outcomes the report names,
// and the Budget holding what it spent
export type IngestStageResult = {
	resources: NewResource[]
	foundCount: number
	status: Scan["status"]
	fallbackSources: Scan["fallbackSources"]
	sourceOutcomes: SourceOutcome[]
	budget: Budget
}

// what review leaves for the write that completes the Scan
export type ReviewStageResult = { review: ReviewSummary; budget: Budget }

/**
 * Ingest every Source on the Topic and store what they turned up. Safe to run again: Resources dedupe on canonical url,
 * so a second ingest attempt lands on the same set of resources instead of ingesting again.
 */
export async function ingestForScan(scanId: string, topicId: string): Promise<IngestStageResult> {
	// the Budget is made here instead of in the workflow, since its limits are read from the environment
	// and a workflow may not do that. a second attempt resumes what the last one had already spent
	const budget = toStageBudget(newBudget())
	return traceScanStage("scan-ingest", scanId, topicId, () =>
		withHeartbeat(budget, async () => {
			// every later stage charges into the budget this returns
			const { sourceOutcomes, summary } = await ingestFromTopicSources(topicId, budget)
			return {
				resources: summary.resources,
				foundCount: summary.foundCount,
				status: summary.status,
				fallbackSources: summary.fallbackSources,
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
			// the Scan row and the owner's LiteLLM proxy key, which bills this Scan's model calls to the user's key instead of the master key
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
			)
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

	// what the Scan kept, counted from its own Findings instead of from the review. a review that ran twice
	// holds totals covering only its last attempt, and counting by topic scan id is what the topic scan email already does
	const [keptRow] = await db.select({ count: count() }).from(findings).where(eq(findings.scanId, scanId))

	// the write completes the Scan: what ingestion found, what review kept, the per-stage costs, and the total
	const [finishedScan] = await db
		.update(scans)
		.set({
			status: ingested.status,
			foundCount: ingested.foundCount,
			fallbackSources: ingested.fallbackSources,
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

	// a manual or creation Scan reports back to whoever fired it, and a scheduled Scan sends the Topic's scan email to its subscribers.
	// that email sends only for a succeeded Scan, which sendTopicScanEmail decides itself
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
 * Record a Scan as failed along with what it had already spent, for a workflow whose stage threw an error.
 */
export async function failScan(scanId: string, reason: string, budget?: Budget): Promise<void> {
	// a Scan that failed before its first stage returned has no spend to record, so the row keeps the zeroes it was opened with
	const spend = budget ? { stageCosts: budget.stageCosts, cost: budget.spentDollars.toString() } : {}
	await db
		.update(scans)
		.set({ status: "failed", error: reason, finishedAt: new Date(), ...spend })
		.where(eq(scans.id, scanId))
}

// report that this worker is alive for as long as the stage runs, and checkpoint the Budget as what it reports.
// the interval dies with the process, and that absence is the signal, so no progress is tracked, and a stage
// that is alive but stuck stays bounded by its own start-to-close timeout.
function withHeartbeat<Result>(budget: Budget, runStage: () => Promise<Result>): Promise<Result> {
	const activityContext = asyncLocalStorage.getStore()
	const heartbeatPump = setInterval(() => activityContext?.heartbeat(budget), HEARTBEAT_INTERVAL_MS)
	return runStage().finally(() => clearInterval(heartbeatPump))
}

// the Budget this attempt runs against: the counters the last attempt checkpointed, or the passed budget
// on a first attempt outside of a workflow
function toStageBudget(passedBudget: Budget): Budget {
	return toResumedBudget(asyncLocalStorage.getStore()?.info.heartbeatDetails, passedBudget)
}

// one llm trace per stage. activities run as separate tasks, so no single span can cover a whole Scan.
// the scan id on every stage is what ties the traces back together
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

// the Scan row this workflow is running, read fresh instead of being carried across a stage.
// a missing row means the Scan was deleted mid-flight.
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

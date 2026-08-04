// the Scan pipeline as three activities: ingest, review, and the write that completes the Scan.
// each stage takes and returns plain data, since Temporal serializes what crosses an activity boundary,
// and the Scan row is loaded by id instead of being included, so a stage reads the Scan row as it stands
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing"
import { trackEvent } from "@shared/analytics"
import { and, count, eq } from "drizzle-orm"
import { db } from "../../db"
import { scans, topics, users } from "../../db/schema"
import { type Budget, newBudget } from "../budget"
import type { SourceOutcome } from "../ingest"
import { ingestFromTopicSources } from "../ingest"
import type { NewResource } from "../ingest/ingester"
import { sendManualScanEmail, sendTopicScanEmail } from "../notify"
import type { ReviewSummary } from "../review"
import { reviewScan } from "../review"

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
	return traceScanStage("scan-ingest", scanId, topicId, async () => {
		// the Budget is made here instead of in the workflow, since its ceilings are read from the environment
		// and a workflow may not do that. every later stage charges into the budget this returns
		const budget = newBudget()
		const { sourceOutcomes, summary } = await ingestFromTopicSources(topicId, budget)
		return {
			resources: summary.resources,
			foundCount: summary.foundCount,
			status: summary.status,
			fallbackSources: summary.fallbackSources,
			sourceOutcomes,
			budget,
		}
	})
}

/**
 * Review what ingest found, paying for the fetches and the model calls the judgment needs.
 * This is the stage that spends, so the workflow does not retry it.
 */
export async function reviewForScan(
	scanId: string,
	topicId: string,
	ownerId: string,
	ingested: IngestStageResult,
	budget: Budget,
): Promise<ReviewStageResult> {
	return traceScanStage("scan-review", scanId, topicId, async () => {
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
			budget,
			owner?.litellmVirtualKey ?? undefined,
		)
		return { review, budget }
	})
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

	// the write finishes the Scan: what ingest found, what review kept, the per-stage costs, and the total
	const [finishedScan] = await db
		.update(scans)
		.set({
			status: ingested.status,
			foundCount: ingested.foundCount,
			fallbackSources: ingested.fallbackSources,
			keptCount: review.keptCount,
			filteredCount: review.filteredCount,
			stageCosts: budget.stageCosts,
			scanSummary: review.scanSummary,
			reused: budget.fetchCounts.reusedCount,
			revalidated: budget.fetchCounts.revalidatedCount,
			fetched: budget.fetchCounts.fetchedCount,
			cost: budget.spent.toString(),
			finishedAt: new Date(),
			// the reclaim writes it's reason on a Scan it canceled out
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
	if (trigger === "creation" || trigger === "manual") {
		await sendManualScanEmail(ownerId, topic, finishedScan)
		return
	}
	await sendTopicScanEmail(topic, finishedScan)
}

/**
 * Record a Scan as failed along with what it had already spent, for a workflow whose stage threw.
 */
export async function failScan(scanId: string, reason: string, budget?: Budget): Promise<void> {
	// a Scan that failed before its first stage returned has no spend to record, so the row keeps the zeroes it was opened with
	const spend = budget ? { stageCosts: budget.stageCosts, cost: budget.spent.toString() } : {}
	await db
		.update(scans)
		.set({ status: "failed", error: reason, finishedAt: new Date(), ...spend })
		.where(eq(scans.id, scanId))
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

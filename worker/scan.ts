// scan orchestration. opens the Scan row, runs the ingest and review stages against one Budget, and records the result
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing"
import { trackEvent } from "@shared/analytics"
import { and, count, desc, eq } from "drizzle-orm"
import { db } from "../db"
import { scans, users } from "../db/schema"
import { type Budget, newBudget } from "./budget"
import { ingestFromTopicSources, type ScanSummary } from "./ingest"
import { reviewScan } from "./review"

// a persisted Scan row
type Scan = typeof scans.$inferSelect

// shared so that propagateAttributes and startActiveObservation always agree on the trace name
const TOPIC_SCAN_TRACE_NAME = "topic-scan"

/**
 * Create a Scan, ingest every Source with failures isolated, then review the results, and end the Scan with its counts and cost.
 * isManual is for bookkeeping only, since the daily quota counts scheduled and manual Scans alike.
 * ownerId is stamped on the Scan so its spend and quota attribution survive the topic being deleted.
 */
export async function runTopicScan(topicId: string, ownerId: string, isManual = false): Promise<Scan | undefined> {
	// get the topic's newest Scan to check if it's still running
	const [newestScan] = await db
		.select({ id: scans.id, status: scans.status })
		.from(scans)
		.where(eq(scans.topicId, topicId))
		.orderBy(desc(scans.startedAt))
		.limit(1)

	// update the start time for a currently running Scan or add a new Scan
	const isScanRunning = newestScan?.status === "running"
	const [scan] = isScanRunning
		? await db.update(scans).set({ startedAt: new Date() }).where(eq(scans.id, newestScan.id)).returning()
		: await db.insert(scans).values({ topicId, ownerId, isManual }).returning()
	if (!scan) {
		throw new Error(`could not create scan for topic ${topicId}`)
	}

	// the row exists either way from here, so ingestion and review run against it
	return processTopicScan(scan, topicId, ownerId)
}

/**
 * Ingest and review an already-running Scan row, ending it with its counts and cost.
 * createTopic stages the topic's first Scan itself so the page lands mid-brew, then returns the open row here rather than starting a second one.
 */
export async function processTopicScan(scan: Scan, topicId: string, ownerId: string): Promise<Scan | undefined> {
	// every model call made while this Scan runs nests under one shared Langfuse trace span
	return propagateAttributes({ traceName: TOPIC_SCAN_TRACE_NAME, metadata: { topicId, scanId: scan.id } }, () =>
		startActiveObservation(TOPIC_SCAN_TRACE_NAME, async () => {
			// the budget is created out here so a failure can still record what the Scan spent before it broke
			const budget = newBudget()

			// a failure after this point must finalize the Scan as failed. never leave it stuck as "running"
			try {
				return await runScanPipeline(scan, topicId, ownerId, budget)
			} catch (error) {
				// record a failure on the Scan row, keeping the spend it already incurred
				const message = error instanceof Error ? error.message : String(error)
				await db
					.update(scans)
					.set({
						status: "failed",
						error: message,
						finishedAt: new Date(),
						stageCosts: budget.stageCosts,
						cost: budget.spent.toString(),
					})
					.where(eq(scans.id, scan.id))

				// rethrow so the caller sees the original error
				throw error
			}
		}),
	)
}

// the Scan pipeline: ingest, review, and save, all charging into the Budget its caller made
async function runScanPipeline(
	scan: Scan,
	topicId: string,
	ownerId: string,
	budget: Budget,
): Promise<Scan | undefined> {
	// ingest every Source and store what they turned up
	const { sourceOutcomes, summary } = await ingestFromTopicSources(topicId, budget)

	// bill this scan's llm calls to the owner's litellm virtual key
	const [owner] = await db
		.select({ litellmVirtualKey: users.litellmVirtualKey, plan: users.plan })
		.from(users)
		.where(eq(users.id, ownerId))

	// review the discovered scan Resources for relevance
	const review = await reviewScan(
		scan,
		topicId,
		summary.resources,
		sourceOutcomes,
		budget,
		owner?.litellmVirtualKey ?? undefined,
	)

	// track the scan event if it is the owner's first Scan to succeed
	const topicScan = await saveTopicScan(scan, summary, review, budget)
	if (summary.status === "succeeded" && (await isFirstSucceededScan(ownerId))) {
		trackEvent("first_scan_completed", ownerId, { plan: owner?.plan ?? "free", topicId })
	}
	return topicScan
}

// write the scan to the database: the ingestion outcomes, the review outcomes, and the Budget's spend and totals
async function saveTopicScan(
	scan: Scan,
	summary: ScanSummary,
	review: Awaited<ReturnType<typeof reviewScan>>,
	budget: ReturnType<typeof newBudget>,
): Promise<Scan | undefined> {
	const [topicScan] = await db
		.update(scans)
		.set({
			// ingestion outcomes
			status: summary.status,
			foundCount: summary.foundCount,
			fallbackSources: summary.fallbackSources,
			// review outcomes, folded into the Scan record
			keptCount: review.keptCount,
			filteredCount: review.filteredCount,
			scanSummary: review.scanSummary,
			// the spend and the totals that the Budget carried through the Scan
			stageCosts: budget.stageCosts,
			cost: budget.spent.toString(),
			reused: budget.fetchCounts.reusedCount,
			revalidated: budget.fetchCounts.revalidatedCount,
			fetched: budget.fetchCounts.fetchedCount,
			finishedAt: new Date(),
		})
		.where(eq(scans.id, scan.id))
		.returning()
	return topicScan
}

// whether the Scan that just finished is this owner's first to succeed
async function isFirstSucceededScan(ownerId: string): Promise<boolean> {
	const [scanCountRow] = await db
		.select({ count: count() })
		.from(scans)
		.where(and(eq(scans.ownerId, ownerId), eq(scans.status, "succeeded")))
	return scanCountRow?.count === 1
}

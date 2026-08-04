// the durable Scan: it runs the pipeline's three stages as activities, so a Scan outlives whatever process asked for it
// and resumes at the stage after the last stage that finished instead of paying twice to redo a stage
import { proxyActivities } from "@temporalio/workflow"
import type * as scanActivities from "./run-topic-scan-activities"
import { FINISH_TIMEOUT_MS, INGEST_TIMEOUT_MS, REVIEW_TIMEOUT_MS } from "./stage-timeouts"

// ingest may be retried: it dedupes on canonical url, so a second attempt lands on the same Resources so its spend does not.
// each attempt builds its own Budget, so the Scan records only the last attempt's ingestion cost,
// and the ceiling stays soft by one ingestion stage per retry. the attempt cap bounds that
const { ingestForScan } = proxyActivities<typeof scanActivities>({
	startToCloseTimeout: INGEST_TIMEOUT_MS,
	retry: { maximumAttempts: 3 },
})

// review pays for the fetches and the model calls, so every attempt spends again. it gets exactly one.
// relaxing this, or moving a paid call into a stage that retries, charges the owner once per attempt
const { reviewForScan } = proxyActivities<typeof scanActivities>({
	startToCloseTimeout: REVIEW_TIMEOUT_MS,
	retry: { maximumAttempts: 1 },
})

// the closing writes are idempotent, so they may retry
const { finishScan, failScan } = proxyActivities<typeof scanActivities>({
	startToCloseTimeout: FINISH_TIMEOUT_MS,
	retry: { maximumAttempts: 3 },
})

/**
 * Runs one Topic's Scan to a terminal status. The Scan row is opened by whoever started this workflow,
 * so this fills in that Scan row instead of writing its own.
 */
export async function runTopicScanWorkflow(
	scanId: string,
	topicId: string,
	ownerId: string,
	trigger: scanActivities.ScanTrigger,
): Promise<void> {
	// the Budget is built by the first stage and rides between stages as a value. it includes the Scan's ceilings,
	// which come from the environment, so it is made where an activity can read it, instead of in the workflow
	let spentBudget: scanActivities.IngestStageResult["budget"] | undefined

	// a stage that throws ends the Scan as failed with whatever it had already spent.
	// rethrowing after would only mark the workflow failed for a Scan already closed
	try {
		const ingestResult = await ingestForScan(scanId, topicId)
		spentBudget = ingestResult.budget

		const reviewResult = await reviewForScan(scanId, topicId, ownerId, ingestResult, ingestResult.budget)
		spentBudget = reviewResult.budget

		await finishScan(scanId, topicId, ownerId, trigger, ingestResult, reviewResult)
	} catch (error) {
		await failScan(scanId, error instanceof Error ? error.message : String(error), spentBudget)
	}
}

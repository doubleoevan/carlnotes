// the durable Scan: it runs the pipeline's three stages as activities, so a Scan outlives whatever process asked for it
// and resumes at the stage after the last stage that finished instead of paying twice to redo a stage
import { CancellationScope, isCancellation, proxyActivities } from "@temporalio/workflow"
import type * as scanActivities from "./run-topic-scan-activities"
// the attempt counts the retry policies that the temporal activities read
import {
	FINISH_ATTEMPTS,
	FINISH_TIMEOUT_MS,
	FINISH_TOTAL_TIMEOUT_MS,
	HEARTBEAT_TIMEOUT_MS,
	INGEST_ATTEMPTS,
	INGEST_TIMEOUT_MS,
	INGEST_TOTAL_TIMEOUT_MS,
	REVIEW_ATTEMPTS,
	REVIEW_TIMEOUT_MS,
	REVIEW_TOTAL_TIMEOUT_MS,
} from "./stage-timeouts"

// ingest activity may be retried: it dedupes on canonical url, so a second attempt converges on the same Resources.
// it heartbeats, so a dead worker is caught in the heartbeat timeout
const { ingestForScan } = proxyActivities<typeof scanActivities>({
	startToCloseTimeout: INGEST_TIMEOUT_MS,
	scheduleToCloseTimeout: INGEST_TOTAL_TIMEOUT_MS,
	heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
	retry: { maximumAttempts: INGEST_ATTEMPTS },
})

// review pays for the fetches and the model calls, so it gets one retry and no more. a second attempt skips every
// Resource that already has a Finding for the Topic and reuses the stored embeddings and content.
// review isolates its own per-Resource failures, so a failure reaching here is systemic
const { reviewForScan } = proxyActivities<typeof scanActivities>({
	startToCloseTimeout: REVIEW_TIMEOUT_MS,
	scheduleToCloseTimeout: REVIEW_TOTAL_TIMEOUT_MS,
	heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
	retry: { maximumAttempts: REVIEW_ATTEMPTS },
})

// the closing writes are idempotent, so they may retry. they are short enough not to need a heartbeat
const { finishScan, failScan, stopScan } = proxyActivities<typeof scanActivities>({
	startToCloseTimeout: FINISH_TIMEOUT_MS,
	scheduleToCloseTimeout: FINISH_TOTAL_TIMEOUT_MS,
	retry: { maximumAttempts: FINISH_ATTEMPTS },
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
	// the Budget is built by the first stage and rides between stages as a value. it includes the Scan's limits,
	// which come from the environment, so it is made where an activity can read it, instead of in the workflow
	let spentBudget: scanActivities.IngestStageResult["budget"] | undefined

	// a stage that throws ends the Scan as failed with whatever it had already spent.
	// rethrowing after would only mark the workflow failed for a Scan already closed
	try {
		const ingestResult = await ingestForScan(scanId, topicId)
		spentBudget = ingestResult.budget

		const reviewResult = await reviewForScan(scanId, topicId, ownerId, ingestResult, ingestResult.budget)
		spentBudget = reviewResult.budget

		// a cancelled stage returns what it had instead of throwing an error, so a Scan cancelled late arrives here
		// with every stage finished. saving it as stopped is what keeps it out of the day's scan count
		if (CancellationScope.current().consideredCancelled) {
			await stopCancelledScan(scanId)
			return
		}
		await finishScan(scanId, topicId, ownerId, trigger, ingestResult, reviewResult)
	} catch (error) {
		// a cancel that landed while a stage was awaiting rejects that stage instead of returning through it
		if (isCancellation(error)) {
			await stopCancelledScan(scanId)
			return
		}
		await failScan(scanId, error instanceof Error ? error.message : String(error), spentBudget)
	}
}

// save a Scan the user cancelled. it keeps the Findings it wrote and the dollars its stages recorded,
// and gives its daily scan back, so it is stopped instead of failed. the write runs where cancellation cannot reach it,
// since every activity a cancelled workflow starts is cancelled the moment it starts, which would leave the row running for the sweep
function stopCancelledScan(scanId: string) {
	return CancellationScope.nonCancellable(() => stopScan(scanId))
}

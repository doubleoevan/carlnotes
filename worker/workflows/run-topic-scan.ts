// the durable Scan: it runs the pipeline's three stages as activities
import { CancellationScope, isCancellation, proxyActivities } from "@temporalio/workflow"
// a relative import. temporal bundles workflow code with webpack, which has no @shared alias
import { toScanFailureReason } from "../../shared/scanFailure"
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

// ingest activity may be retried: it dedupes on canonical url
const { ingestForScan } = proxyActivities<typeof scanActivities>({
	startToCloseTimeout: INGEST_TIMEOUT_MS,
	scheduleToCloseTimeout: INGEST_TOTAL_TIMEOUT_MS,
	heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
	retry: { maximumAttempts: INGEST_ATTEMPTS },
})

// review pays for the fetches and the model calls, so it gets one retry and no more
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
	// the Budget is built by the first stage and goes between stages as a value
	let spentBudget: scanActivities.IngestStageResult["budget"] | undefined

	// a stage that throws an error ends the Scan as failed with whatever it had already spent
	try {
		const ingestResult = await ingestForScan(scanId, topicId)
		spentBudget = ingestResult.budget

		const reviewResult = await reviewForScan(scanId, topicId, ownerId, ingestResult, ingestResult.budget)
		spentBudget = reviewResult.budget

		// a cancelled stage returns what it had instead of throwing an error
		if (CancellationScope.current().consideredCancelled) {
			await stopCancelledScan(scanId)
			return
		}
		await finishScan(scanId, topicId, ownerId, trigger, ingestResult, reviewResult)
	} catch (error) {
		// a cancel that lands while a stage is waiting rejects that stage instead of returning through it
		if (isCancellation(error)) {
			await stopCancelledScan(scanId)
			return
		}
		await failScan(scanId, toScanFailureReason(error), spentBudget)
	}
}

// save a Scan the user cancelled
function stopCancelledScan(scanId: string): Promise<void> {
	return CancellationScope.nonCancellable(() => stopScan(scanId))
}

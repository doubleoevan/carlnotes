// updates topic memories after a successful Scan and backfills a bounded history on operator request
import {
	TOPIC_MEMORY_ACTIVITY_TIMEOUT_MS,
	TOPIC_MEMORY_UPDATE_ATTEMPTS,
	type TopicMemoryBackfillSummary,
} from "@carlnotes/contracts/topicMemoryWork"
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS } from "@carlnotes/pipeline/stageTimeouts"
import { continueAsNew, isCancellation, log, patched, proxyActivities, sleep } from "@temporalio/workflow"
import type * as activities from "./topicMemoriesActivities"

const { updateTopicMemoriesActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: TOPIC_MEMORY_ACTIVITY_TIMEOUT_MS,
	heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
	retry: { initialInterval: HEARTBEAT_INTERVAL_MS, maximumAttempts: TOPIC_MEMORY_UPDATE_ATTEMPTS },
})
const { listTopicMemoryBackfillPage } = proxyActivities<typeof activities>({
	startToCloseTimeout: "1 minute",
	retry: { maximumAttempts: 3 },
})

/** Maintains the Journal after the Scan's closing write. */
export async function updateTopicMemoriesWorkflow(scanId: string): Promise<void> {
	await updateTopicMemoriesActivity(scanId)
}

// how many Scans in a row may fail before the backfill waits, and how long it waits before it tries the last of them
// once more. failures in a row are a rate limit or an outage, which the next Topic's Scans would meet too
const BACKFILL_FAILURES_BEFORE_PAUSE = 3
const BACKFILL_PAUSE = "10 minutes"

// the cursor and counters passed to the next Temporal run, with how many Scans had failed in a row as it ended
type BackfillTopicMemoriesInput = {
	before?: string
	afterTopicId?: string
	summary?: TopicMemoryBackfillSummary
	failureInRowCount?: number
}

/** Revisits at most five Scans per Topic, oldest first, without replaying paused work. */
export async function backfillTopicMemoriesWorkflow({
	before = new Date().toISOString(),
	afterTopicId,
	summary = { updated: 0, skipped: 0, paused: 0, failed: 0 },
	failureInRowCount: previousFailureInRowCount = 0,
}: BackfillTopicMemoriesInput = {}): Promise<TopicMemoryBackfillSummary> {
	// keep the previous runs' counts, and process Scans serially within a Topic
	const totals = { ...summary }
	let failureInRowCount = previousFailureInRowCount
	const page = await listTopicMemoryBackfillPage({ before, afterTopicId })
	for (const scanIds of page.scanIdsByTopic) {
		for (const scanId of scanIds) {
			// a failed Scan leaves the rest of its Topic eligible for updates
			let updateScanTopicMemoriesResult = await updateScanTopicMemories(scanId)
			failureInRowCount = updateScanTopicMemoriesResult === "failed" ? failureInRowCount + 1 : 0

			// after failures in a row, wait and try the same Scan once more. a run replaying from before the patch never
			// waited
			if (failureInRowCount >= BACKFILL_FAILURES_BEFORE_PAUSE && patched("topic-memory-backfill-pause")) {
				await sleep(BACKFILL_PAUSE)
				updateScanTopicMemoriesResult = await updateScanTopicMemories(scanId)
				failureInRowCount = updateScanTopicMemoriesResult === "failed" ? failureInRowCount : 0
			}
			totals[updateScanTopicMemoriesResult] += 1
		}
	}

	// a new run bounds the history even across thousands of Topics
	log.info("Journal backfill progress", totals)
	if (page.afterTopicId) {
		await continueAsNew<typeof backfillTopicMemoriesWorkflow>({
			before,
			afterTopicId: page.afterTopicId,
			summary: totals,
			failureInRowCount,
		})
	}
	return totals
}

// update one Scan's topic memories on the platform's bill, and return how the update ended, with "failed" for one
// that ran out of attempts
async function updateScanTopicMemories(scanId: string): Promise<keyof TopicMemoryBackfillSummary> {
	try {
		return await updateTopicMemoriesActivity(scanId, true)
	} catch (error) {
		// a cancelled backfill ends here, and any other failure is one more Scan that could not be updated
		if (isCancellation(error)) {
			throw error
		}
		log.warn("Journal backfill could not update topic memories for a Scan", { scanId })
		return "failed"
	}
}

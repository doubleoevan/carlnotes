// updates takeaways after a successful Scan and backfills a bounded history on operator request
import { TOPIC_MEMORY_ACTIVITY_TIMEOUT_MS, type TopicMemoryBackfillSummary } from "@carlnotes/contracts/topicMemoryWork"
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS } from "@carlnotes/pipeline/stageTimeouts"
import { continueAsNew, isCancellation, log, proxyActivities } from "@temporalio/workflow"
import type * as activities from "./topicMemoriesActivities"

const { updateTopicTakeawaysActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: TOPIC_MEMORY_ACTIVITY_TIMEOUT_MS,
	heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
	retry: { initialInterval: HEARTBEAT_INTERVAL_MS, maximumAttempts: 3 },
})
const { listTopicMemoryBackfillPage } = proxyActivities<typeof activities>({
	startToCloseTimeout: "1 minute",
	retry: { maximumAttempts: 3 },
})

/** Maintains the Journal after the Scan's closing write. */
export async function updateTopicTakeawaysWorkflow(scanId: string): Promise<void> {
	await updateTopicTakeawaysActivity(scanId)
}

// the cursor and counters passed to the next Temporal run
type BackfillTopicMemoriesInput = {
	before?: string
	afterTopicId?: string
	summary?: TopicMemoryBackfillSummary
}

/** Revisits at most five Scans per Topic, oldest first, without replaying paused work. */
export async function backfillTopicTakeawaysWorkflow({
	before = new Date().toISOString(),
	afterTopicId,
	summary = { updated: 0, skipped: 0, paused: 0, failed: 0 },
}: BackfillTopicMemoriesInput = {}): Promise<TopicMemoryBackfillSummary> {
	// keep the previous runs' counts, and process Scans serially within a Topic
	const totals = { ...summary }
	const page = await listTopicMemoryBackfillPage({ before, afterTopicId })
	for (const scanIds of page.scanIdsByTopic) {
		for (const scanId of scanIds) {
			// a failed Scan leaves the rest of its Topic eligible for updates
			try {
				const result = await updateTopicTakeawaysActivity(scanId)
				totals[result] += 1
			} catch (error) {
				if (isCancellation(error)) {
					throw error
				}
				// retain the failure count across continue-as-new runs
				log.warn("Journal backfill could not update takeaways for a Scan", { scanId })
				totals.failed += 1
			}
		}
	}

	// a new run bounds the history even across thousands of Topics
	log.info("Journal backfill progress", totals)
	if (page.afterTopicId) {
		await continueAsNew<typeof backfillTopicTakeawaysWorkflow>({
			before,
			afterTopicId: page.afterTopicId,
			summary: totals,
		})
	}
	return totals
}

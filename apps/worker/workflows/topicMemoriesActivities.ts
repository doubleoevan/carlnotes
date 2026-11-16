// the Journal model work and the bounded historical scan listing
import { TOPIC_MEMORY_ATTEMPT_DEADLINE_MS } from "@carlnotes/contracts/topicMemoryWork"
import { db } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { HEARTBEAT_INTERVAL_MS } from "@carlnotes/pipeline/stageTimeouts"
import { updateTopicTakeaways } from "@carlnotes/pipeline/updateTopicTakeaways"
import { ApplicationFailure, Context } from "@temporalio/activity"
import { and, desc, eq, gt, lte, sql } from "drizzle-orm"

/** Runs one idempotent takeaway update outside the workflow sandbox. */
export async function updateTopicTakeawaysActivity(scanId: string): ReturnType<typeof updateTopicTakeaways> {
	// heartbeat so Temporal can cancel in-flight model calls, and stop before the activity's hard timeout
	const activity = Context.current()
	const signal = AbortSignal.any([activity.cancellationSignal, AbortSignal.timeout(TOPIC_MEMORY_ATTEMPT_DEADLINE_MS)])
	const heartbeat = setInterval(() => activity.heartbeat(), HEARTBEAT_INTERVAL_MS)
	try {
		return await updateTopicTakeaways(scanId, signal)
	} catch {
		// provider errors can include prompts or credential details. do not copy them to workflow history or logs
		signal.throwIfAborted()
		throw ApplicationFailure.retryable("Journal takeaway update failed", "TopicTakeawayUpdateFailed")
	} finally {
		clearInterval(heartbeat)
	}
}

/** Reads a small page of Topics and the last five successful Scans of each, oldest first. */
export async function listTopicMemoryBackfillPage({
	before,
	afterTopicId,
}: {
	before: string
	afterTopicId?: string
}): Promise<{ scanIdsByTopic: string[][]; afterTopicId?: string }> {
	// one bounded lookup pages Topics and keeps their latest five successful Scans per Topic
	const topicPage = db
		.select({ id: topics.id })
		.from(topics)
		.where(afterTopicId ? gt(topics.id, afterTopicId) : undefined)
		.orderBy(topics.id)
		.limit(20)
		.as("topic_page")
	// apply the cutoff before choosing the last five Scans of each Topic
	const latestScans = db
		.select({ id: scans.id, startedAt: scans.startedAt })
		.from(scans)
		.where(and(eq(scans.topicId, topicPage.id), eq(scans.status, "succeeded"), lte(scans.finishedAt, new Date(before))))
		.orderBy(desc(scans.startedAt), desc(scans.id))
		.limit(5)
		.as("latest_scans")
	// the workflow processes the selected Scans oldest first
	const rows = await db
		.select({ topicId: topicPage.id, scanId: latestScans.id })
		.from(topicPage)
		.leftJoinLateral(latestScans, sql`true`)
		.orderBy(topicPage.id, latestScans.startedAt, latestScans.id)

	// retain Topics without Scans so an empty Topic can still advance the cursor
	const scanIdsByTopic = new Map<string, string[]>()
	for (const { topicId, scanId } of rows) {
		const scanIds = scanIdsByTopic.get(topicId) ?? []
		if (scanId) {
			scanIds.push(scanId)
		}
		scanIdsByTopic.set(topicId, scanIds)
	}

	return { scanIdsByTopic: [...scanIdsByTopic.values()], afterTopicId: rows.at(-1)?.topicId }
}

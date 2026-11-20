// the Journal model work and the bounded historical scan listing
import {
	TOPIC_MEMORY_ACTIVITY_TIMEOUT_MS,
	TOPIC_MEMORY_ATTEMPT_DEADLINE_MS,
	TOPIC_MEMORY_RETRY_MARGIN_MS,
	TOPIC_MEMORY_UPDATE_ATTEMPTS,
} from "@carlnotes/contracts/topicMemoryWork"
import { db } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { toErrorCauses } from "@carlnotes/models/models"
import {
	TopicMemoryAuthenticationError,
	TopicMemoryLeaseHeldError,
	updateTopicMemories,
} from "@carlnotes/pipeline/updateTopicMemories"
import { reportError } from "@carlnotes/server/monitoring"
import { ApplicationFailure, Context } from "@temporalio/activity"
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm"
import { runWithHeartbeat } from "../activityHeartbeat"

/**
 * Runs one idempotent topic memory update outside the workflow sandbox. The backfill's update is the platform's to pay
 * for, and a Scan's own is its owner's.
 */
export async function updateTopicMemoriesActivity(
	scanId: string,
	isPlatformBilled = false,
): ReturnType<typeof updateTopicMemories> {
	// heartbeat so Temporal can cancel in-flight model calls, and stop before the activity's hard timeout
	const activity = Context.current()
	const signal = AbortSignal.any([activity.cancellationSignal, AbortSignal.timeout(TOPIC_MEMORY_ATTEMPT_DEADLINE_MS)])
	const waitDeadlineAt = Date.now() + TOPIC_MEMORY_ATTEMPT_DEADLINE_MS - TOPIC_MEMORY_RETRY_MARGIN_MS
	try {
		return await runWithHeartbeat(() => updateTopicMemories(scanId, signal, { waitDeadlineAt, isPlatformBilled }))
	} catch (error) {
		// a cancelled attempt ends as cancelled, and a rejected key ends the update with its safe message
		activity.cancellationSignal.throwIfAborted()
		if (error instanceof TopicMemoryAuthenticationError) {
			reportError(error, "worker", { scanId, operation: "topicMemories" })
			throw ApplicationFailure.nonRetryable(error.message, "TopicMemoryAuthenticationFailed")
		}
		reportLastAttemptFailure(scanId, error)

		// another attempt holds the Scan's lease until it ends, so the next attempt waits out a whole attempt
		if (error instanceof TopicMemoryLeaseHeldError) {
			throw ApplicationFailure.create({
				message: error.message,
				type: "TopicMemoryUpdateLeaseHeld",
				nextRetryDelay: TOPIC_MEMORY_ACTIVITY_TIMEOUT_MS,
			})
		}

		// provider errors can include prompts or credential details, so the workflow history gets a fixed message.
		// Temporal runs a failed attempt again, and the history names an attempt that ran past its own deadline
		throw signal.aborted
			? ApplicationFailure.retryable("Journal topic memory update ran past its deadline", "TopicMemoryUpdateTimedOut")
			: ApplicationFailure.retryable("Journal topic memory update failed", "TopicMemoryUpdateFailed")
	}
}

// report the failure of an update's last attempt, which leaves the Scan with no topic memories, by its error class
// and the status and error codes in its cause chain. a provider's message can hold a prompt or a key, so it is never
// read
function reportLastAttemptFailure(scanId: string, error: unknown): void {
	if (Context.current().info.attempt < TOPIC_MEMORY_UPDATE_ATTEMPTS) {
		return
	}
	const causes = toErrorCauses(error) as { statusCode?: unknown; code?: unknown }[]
	const errorName = error instanceof Error ? error.name : typeof error
	const statusCode = causes.find((cause) => typeof cause.statusCode === "number")?.statusCode
	const errorCode = causes.find((cause) => typeof cause.code === "string")?.code

	// the error class is in the message, so each kind of failure is its own report
	const failure = new Error(`a topic memory update failed its last attempt with ${errorName}`)
	console.error(`${failure.message} for scan ${scanId}`, { statusCode, errorCode })
	reportError(failure, "worker", {
		scanId,
		operation: "topicMemories",
		errorName,
		...(statusCode === undefined ? {} : { statusCode: String(statusCode) }),
		...(errorCode === undefined ? {} : { errorCode: String(errorCode) }),
	})
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
	// apply the cutoff before choosing the last five Scans of each Topic. a Scan that its user stopped starts no
	// update of its own, so the backfill leaves it out too
	const isScanToUpdate = and(eq(scans.status, "succeeded"), isNull(scans.stoppedAt))
	const latestScans = db
		.select({ id: scans.id, startedAt: scans.startedAt })
		.from(scans)
		.where(and(eq(scans.topicId, topicPage.id), isScanToUpdate, lte(scans.finishedAt, new Date(before))))
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

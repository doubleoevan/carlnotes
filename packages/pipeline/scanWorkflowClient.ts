// the Temporal calls for a Scan. it starts and cancels a Scan under the Topic's workflow id, and reads the Scan queue's
// pollers and backlog

import type { ThresholdCrossing } from "@carlnotes/server/monitoring"
import { WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from "@temporalio/client"
import { getClient, withClientDeadline } from "./temporalClient"

// what asked for a Scan, which decides what its end announces
export type ScanTrigger = "manual" | "scheduled" | "creation"

// scans poll their own queue instead of sharing the attachment one
export const SCAN_TASK_QUEUE = "topic-scans"
const SCAN_WORKFLOW = "runTopicScanWorkflow"

// Temporal's TASK_QUEUE_TYPE_ACTIVITY, the Scan queue's activity side, where a Scan's activities wait for a scan slot
const ACTIVITY_TASK_QUEUE_TYPE = 2

// how long the oldest waiting Scan activity may wait for a slot before the backlog is reported
const SCAN_BACKLOG_ALERT_MS = 15 * 60 * 1000

// the Scan queue's pollers and its activity backlog: how many tasks wait, and how long the oldest one has waited,
// which is null if the server cannot say
export type ScanQueueDescription = { pollerCount: number; backlogCount: number; oldestBacklogAgeMs: number | null }

// whether the Scan was handed to Temporal, and a call that waits for it to end.
// it is a call, not a promise, so a process that only starts a Scan opens no long-poll and exits on its own
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ScanStart = { status: "started"; whenFinished: () => Promise<void> } | { status: "running" }

// whether a cancel reached a running Scan, and a call that waits for the cancelled Scan to wind down.
// it is a call for the same reason as ScanStart's, and it resolves once the workflow has ended, however it ended
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ScanCancel = { status: "cancelled"; whenStopped: () => Promise<void> } | { status: "idle" }

/**
 * Start the durable workflow for a Scan row that is already open. Temporal owns the Scan from here,
 * so it runs to a terminal status even if this process goes away.
 */
export async function startTopicScanWorkflow(
	scanId: string,
	topicId: string,
	ownerId: string,
	trigger: ScanTrigger,
): Promise<ScanStart> {
	const client = await getClient()
	try {
		// the workflow id is derived from the topic
		const workflowHandle = await withClientDeadline(client, () =>
			client.workflow.start(SCAN_WORKFLOW, {
				taskQueue: SCAN_TASK_QUEUE,
				workflowId: `scan-${topicId}`,
				args: [scanId, topicId, ownerId, trigger],
			}),
		)
		// return the wait as a call that opens its long-poll only when asked
		return { status: "started", whenFinished: () => workflowHandle.result() }
	} catch (error) {
		// a Topic already scanning is an expected result, and anything else throws an error
		if (error instanceof WorkflowExecutionAlreadyStartedError) {
			return { status: "running" }
		}
		throw error
	}
}

/**
 * Cancel the Scan a Topic is running. The workflow id is derived from the Topic, so the caller needs no stored id.
 * A Topic with nothing running anymore returns "idle".
 */
export async function cancelTopicScanWorkflow(topicId: string): Promise<ScanCancel> {
	const client = await getClient()
	try {
		const workflowHandle = client.workflow.getHandle(`scan-${topicId}`)

		// the server accepts a cancel on a finished workflow, so read its status first
		const { status } = await withClientDeadline(client, () => workflowHandle.describe())
		if (status.name !== "RUNNING") {
			return { status: "idle" }
		}
		await withClientDeadline(client, () => workflowHandle.cancel())

		// the result rejects with the cancellation once the workflow has wound down, which is the wait's end
		return {
			status: "cancelled",
			whenStopped: () =>
				workflowHandle.result().then(
					() => undefined,
					() => undefined,
				),
		}
	} catch (error) {
		// a workflow that is missing leaves nothing to cancel
		if (error instanceof WorkflowNotFoundError) {
			return { status: "idle" }
		}
		throw error
	}
}

/**
 * Describes the Scan queue: how many workers poll it, and how many Scan activities wait for a slot and for how long.
 * Zero pollers means no Scan will run at all, however healthy the api looks.
 */
export async function describeScanQueue(): Promise<ScanQueueDescription> {
	const client = await getClient()

	// the stats a current server reports, and the backlog hint an older one returns instead, under the call deadline
	const queue = await withClientDeadline(client, () =>
		client.workflowService.describeTaskQueue({
			namespace: client.options.namespace,
			taskQueue: { name: SCAN_TASK_QUEUE },
			taskQueueType: ACTIVITY_TASK_QUEUE_TYPE,
			reportStats: true,
			includeTaskQueueStatus: true,
		}),
	)

	// a server without stats gives a depth from its hint and no age
	const pollerCount = queue.pollers?.length ?? 0
	if (!queue.stats) {
		return { pollerCount, backlogCount: Number(queue.taskQueueStatus?.backlogCountHint ?? 0), oldestBacklogAgeMs: null }
	}
	const backlogAge = queue.stats.approximateBacklogAge
	return {
		pollerCount,
		backlogCount: Number(queue.stats.approximateBacklogCount ?? 0),
		oldestBacklogAgeMs: backlogAge
			? Number(backlogAge.seconds ?? 0) * 1000 + Math.round((backlogAge.nanos ?? 0) / 1_000_000)
			: null,
	}
}

/**
 * Returns the Scan queue's backlog as a threshold crossing if its oldest Scan activity
 * has waited over 15 minutes for a slot, and null otherwise, including if the server cannot say how long.
 */
export function toScanBacklogCrossing({
	backlogCount,
	oldestBacklogAgeMs,
}: ScanQueueDescription): ThresholdCrossing | null {
	if (oldestBacklogAgeMs === null || oldestBacklogAgeMs <= SCAN_BACKLOG_ALERT_MS) {
		return null
	}
	return {
		condition: "scan-backlog",
		message: "a scan waited over 15 minutes for a slot",
		values: { backlogCount, oldestBacklogAgeMs },
	}
}

// the Temporal calls for a Scan. it starts a Scan on the queue of its trigger and cancels one under the Topic's
// workflow id, and reads the Scan queue's pollers and backlog

import { WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from "@temporalio/client"
import { getClient, withClientDeadline } from "./temporalClient"
import { type BacklogCrossing, describeTaskQueue, type TaskQueueDescription } from "./temporalTaskQueues"

// what asked for a Scan, which decides what its end announces
export type ScanTrigger = "manual" | "scheduled" | "creation"

// scans poll their own queue instead of sharing the attachment one. a scheduled Scan starts on a second queue with
// slots of its own, so a person's first or manual Scan never waits behind the platform's scheduled ones
export const SCAN_TASK_QUEUE = "topic-scans"
export const SCHEDULED_SCAN_TASK_QUEUE = "topic-scans-scheduled"
const SCAN_WORKFLOW = "runTopicScanWorkflow"

/**
 * Returns the task queue that a Scan's workflow starts on: the scheduled queue for a scheduled Scan, and the Scan queue
 * for a first or a manual Scan. A Scan's ingest and review run on its workflow's queue, so a Scan that started before a
 * deploy finishes on the queue it started on.
 */
export function toScanTaskQueue(trigger: ScanTrigger): string {
	return trigger === "scheduled" ? SCHEDULED_SCAN_TASK_QUEUE : SCAN_TASK_QUEUE
}

// the report of the Scan queue's backlog, once its oldest Scan activity has waited over 15 minutes for a slot
export const SCAN_BACKLOG_CROSSING: BacklogCrossing = {
	alertMs: 15 * 60 * 1000,
	condition: "scan-backlog",
	message: "a scan waited over 15 minutes for a slot",
}

// whether the Scan was handed to Temporal, and a call that waits for it to end.
// it is a call, not a promise, so a process that only starts a Scan opens no long-poll and exits on its own
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ScanStart = { status: "started"; whenFinished: () => Promise<void> } | { status: "running" }

// whether a cancel reached a running Scan, and a call that waits for the cancelled Scan to wind down.
// it is a call for the same reason as ScanStart's, and it resolves once the workflow has ended, however it ended
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ScanCancel = { status: "cancelled"; whenStopped: () => Promise<void> } | { status: "idle" }

/**
 * Starts the durable workflow for a Scan row that is already open, on the queue of its trigger. Temporal owns the Scan
 * from here, so it runs to a terminal status even if this process goes away.
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
				taskQueue: toScanTaskQueue(trigger),
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
export function describeScanQueue(): Promise<TaskQueueDescription> {
	return describeTaskQueue(SCAN_TASK_QUEUE)
}

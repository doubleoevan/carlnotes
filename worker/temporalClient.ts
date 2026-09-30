// the Temporal client that the api and the sweep use to start durable workflows
import type { ThresholdCrossing } from "@shared/monitoring"
import { Client, Connection, WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from "@temporalio/client"
import type { ScanTrigger } from "./workflows/runTopicScanActivities"

// the task queue the attachment worker polls, and the workflow it runs started by name
export const ATTACHMENT_TASK_QUEUE = "attachment-processing"
const ATTACHMENT_WORKFLOW = "processAttachment"

// scans poll their own queue instead of sharing the attachment one
export const SCAN_TASK_QUEUE = "topic-scans"
const SCAN_WORKFLOW = "runTopicScanWorkflow"

// an llm-guard screen of a Source gets its own queue because a Worker binds one workflow bundle to one queue
export const SOURCE_TASK_QUEUE = "source-screening"
const SOURCE_WORKFLOW = "screenSourceWorkflow"

// how long a task queue description may take before the scan sweep gives up on it and continues
const QUEUE_DESCRIBE_TIMEOUT_MS = 10_000

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

// whether a cancel reached a running Scan
export type ScanCancel = { status: "cancelled" } | { status: "idle" }

// the reused client promise, built on first use from the TEMPORAL_ADDRESS endpoint
let clientPromise: Promise<Client> | undefined

// start the durable processing workflow for a freshly stored attachment
export async function startAttachmentWorkflow(attachmentId: string): Promise<void> {
	// the workflow id is derived from the attachment id
	const client = await getClient()
	await client.workflow.start(ATTACHMENT_WORKFLOW, {
		taskQueue: ATTACHMENT_TASK_QUEUE,
		workflowId: `attachment-${attachmentId}`,
		args: [attachmentId],
	})
}

/**
 * Start the llm-guard screening workflow for a url Source that was just saved.
 * A Source already in an llm-guard screen is rejected by its workflow id, which makes a restart safe to repeat.
 */
export async function startSourceScreenWorkflow(sourceId: string): Promise<void> {
	const client = await getClient()
	try {
		await client.workflow.start(SOURCE_WORKFLOW, {
			taskQueue: SOURCE_TASK_QUEUE,
			workflowId: `source-${sourceId}`,
			args: [sourceId],
		})
	} catch (error) {
		// a Source whose llm-guard screen is already running needs no second one, and anything else is a real failure
		if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
			throw error
		}
	}
}

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
		const workflowHandle = await client.workflow.start(SCAN_WORKFLOW, {
			taskQueue: SCAN_TASK_QUEUE,
			workflowId: `scan-${topicId}`,
			args: [scanId, topicId, ownerId, trigger],
		})
		// return the wait as a call that opens its long-poll only when asked
		return { status: "started", whenFinished: () => workflowHandle.result() }
	} catch (error) {
		// a Topic already scanning is an expected answer, not a failure. anything else is
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
		await client.workflow.getHandle(`scan-${topicId}`).cancel()
		return { status: "cancelled" }
	} catch (error) {
		// a workflow that is missing or already completed leaves nothing to cancel
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

	// a describe that never responds would hang the sweep before it starts a single Scan.
	// the time limit's timer stops once the describe finishes, so the one-shot sweep can exit
	let timeLimitTimer: ReturnType<typeof setTimeout> | undefined
	const timeLimit = new Promise<never>((_resolve, reject) => {
		timeLimitTimer = setTimeout(
			() => reject(new Error("describing the scan task queue timed out")),
			QUEUE_DESCRIBE_TIMEOUT_MS,
		)
	})

	// the stats a current server reports, and the backlog hint an older one returns instead
	const queue = await Promise.race([
		client.workflowService.describeTaskQueue({
			namespace: client.options.namespace,
			taskQueue: { name: SCAN_TASK_QUEUE },
			taskQueueType: ACTIVITY_TASK_QUEUE_TYPE,
			reportStats: true,
			includeTaskQueueStatus: true,
		}),
		timeLimit,
	]).finally(() => clearTimeout(timeLimitTimer))

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

// the reused Temporal client instance, connected to the TEMPORAL_ADDRESS endpoint on first use
function getClient(): Promise<Client> {
	// connect once and reuse the client. clear a failed connection so the next call connects again
	clientPromise ??= Connection.connect({ address: Bun.env.TEMPORAL_ADDRESS })
		.then((connection) => new Client({ connection }))
		.catch((error: unknown) => {
			clientPromise = undefined
			throw error
		})
	return clientPromise
}

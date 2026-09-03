// the Temporal client that the api and the sweep use to start durable workflows
import { Client, Connection, WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from "@temporalio/client"
import type { ScanTrigger } from "./workflows/run-topic-scan-activities"

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

// whether the Scan was handed to Temporal, and a promise that settles when it ends
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ScanStart = { status: "started"; whenFinished: Promise<void> } | { status: "running" }

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
		// the sweep starts a Scan and moves on without waiting for this
		const whenFinished = workflowHandle.result()
		whenFinished.catch(() => {})
		return { status: "started", whenFinished }
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
 * How many workers are polling the Scan queue. Zero here is the signal to alert on:
 * it means no Scan will run at all, however healthy the api looks.
 */
export async function countScanQueuePollers(): Promise<number> {
	const client = await getClient()

	// a describe that never responds would hang the sweep before it starts a single Scan
	const queue = await Promise.race([
		client.workflowService.describeTaskQueue({
			namespace: client.options.namespace,
			taskQueue: { name: SCAN_TASK_QUEUE },
		}),
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("describing the scan task queue timed out")), QUEUE_DESCRIBE_TIMEOUT_MS),
		),
	])
	return queue.pollers?.length ?? 0
}

// the reused Temporal client instance, connected to the TEMPORAL_ADDRESS endpoint on first use
function getClient(): Promise<Client> {
	// build the connection once and reuse it for every subsequent workflow start
	if (!clientPromise) {
		clientPromise = Connection.connect({ address: Bun.env.TEMPORAL_ADDRESS }).then(
			(connection) => new Client({ connection }),
		)
	}
	return clientPromise
}

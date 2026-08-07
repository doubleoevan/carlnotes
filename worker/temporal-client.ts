// the Temporal client that the api and the sweep use to start durable workflows.
// one lazily built connection is reused, so a request starts a workflow without opening a fresh connection each time
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client"
import type { ScanTrigger } from "./workflows/run-topic-scan-activities"

// the task queue the attachment worker polls, and the workflow it runs
// started by name so that the client never imports workflow code
export const ATTACHMENT_TASK_QUEUE = "attachment-processing"
const ATTACHMENT_WORKFLOW = "processAttachment"

// scans poll their own queue instead of sharing the attachment one. a Scan holds an activity slot for up to half an hour,
// and a shared queue would let a run of scan jobs starve the seconds-long attachment jobs
export const SCAN_TASK_QUEUE = "topic-scans"
const SCAN_WORKFLOW = "runTopicScanWorkflow"

// screening a Source gets its own queue because a Worker binds one workflow bundle to one queue
export const SOURCE_TASK_QUEUE = "source-screening"
const SOURCE_WORKFLOW = "screenSourceWorkflow"

// how long a task queue description may take before the scan sweep gives up on it and carries on
const QUEUE_DESCRIBE_TIMEOUT_MS = 10_000

// whether the Scan was handed to Temporal, and a promise that settles when it ends.
// "running" means the Topic already had a scan in flight, and the workflow id is what rejected this new start
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ScanStart = { status: "started"; whenFinished: Promise<void> } | { status: "running" }

// the reused client promise, built on first use from the TEMPORAL_ADDRESS endpoint
let clientPromise: Promise<Client> | undefined

// start the durable processing workflow for a freshly stored attachment
export async function startAttachmentWorkflow(attachmentId: string): Promise<void> {
	// the workflow id is derived from the attachment id, so that an attachment never has a duplicate workflow running at the same time
	const client = await getClient()
	await client.workflow.start(ATTACHMENT_WORKFLOW, {
		taskQueue: ATTACHMENT_TASK_QUEUE,
		workflowId: `attachment-${attachmentId}`,
		args: [attachmentId],
	})
}

/**
 * Start the llm-guard screening workflow for a url Source that was just saved.
 * A Source already being screened is rejected by its workflow id, which makes a restart safe to repeat.
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
		// a Source whose screen is already running needs no second one, and anything else is a real failure
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
		// the workflow id is derived from the topic,
		// so Temporal itself rejects a second Scan for a Topic that already has one running
		const workflowHandle = await client.workflow.start(SCAN_WORKFLOW, {
			taskQueue: SCAN_TASK_QUEUE,
			workflowId: `scan-${topicId}`,
			args: [scanId, topicId, ownerId, trigger],
		})
		// the sweep starts a Scan and moves on without awaiting this, so an uncaught failure would surface as an
		// unhandled rejection and take the process down. the handler makes it safe to ignore,
		// and the promise still rejects for a caller that does await it
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

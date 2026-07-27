// the Temporal client that the synchronous ingestion uses to start the attachment processing workflow.
// one lazily built connection is reused, so an upload starts a workflow without opening a fresh connection each time
import { Client, Connection } from "@temporalio/client"

// the task queue the attachment worker polls, and the workflow it runs
// started by name so that the client never imports workflow code
export const ATTACHMENT_TASK_QUEUE = "attachment-processing"
const ATTACHMENT_WORKFLOW = "processAttachment"

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

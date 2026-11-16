// starts or joins the Journal backfill in the selected Doppler environment
import {
	TOPIC_MEMORY_BACKFILL_WORKFLOW,
	TOPIC_MEMORY_TASK_QUEUE,
	type TopicMemoryBackfillSummary,
} from "@carlnotes/contracts/topicMemoryWork"
import { getClient, withClientDeadline } from "@carlnotes/pipeline/temporalClient"

const client = await getClient()
const handle = await withClientDeadline(client, () =>
	client.workflow.start(TOPIC_MEMORY_BACKFILL_WORKFLOW, {
		taskQueue: TOPIC_MEMORY_TASK_QUEUE,
		workflowId: "topic-memories-backfill",
		workflowIdConflictPolicy: "USE_EXISTING",
		args: [],
	}),
)
const summary: TopicMemoryBackfillSummary = await handle.result()
console.log("Journal backfill", summary)
process.exit(summary.failed > 0 ? 1 : 0)

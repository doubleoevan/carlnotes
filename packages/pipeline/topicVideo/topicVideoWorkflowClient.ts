// the Temporal starts of a podcast episode's film: a render started again by the reaper, a rebuild for a new image,
// and the backfill

import {
	TOPIC_VIDEO_BACKFILL_TASK_QUEUE,
	TOPIC_VIDEO_BACKFILL_WORKFLOW,
	TOPIC_VIDEO_BACKFILL_WORKFLOW_ID,
	TOPIC_VIDEO_REBUILD_TASK_QUEUE,
	TOPIC_VIDEO_REBUILD_WORKFLOW,
	TOPIC_VIDEO_TASK_QUEUE,
	TOPIC_VIDEO_WORKFLOW,
	type TopicVideoBackfillSummary,
	type TopicVideoRenderVersion,
	toTopicVideoRebuildWorkflowId,
	toTopicVideoWorkflowId,
} from "@carlnotes/contracts/topicVideoWork"
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client"
import { getClient, startWorkflowOnce, withClientDeadline } from "../temporalClient"

// the podcast episode whose film to render, the render version to render it at, and whether the platform pays
export type StartTopicVideoRenderWorkflowOptions = {
	podcastEpisodeId: string
	renderVersion: TopicVideoRenderVersion
	isPlatformBilled: boolean
}

/**
 * Starts a podcast episode's film render again from outside its recording's workflow, as the reaper does for a row
 * whose workflow is gone: the same workflow, id, and queue as the recording's own child start. The render is marked
 * as started again, so it reuses what the first run stored. A render that runs under the id is left alone.
 */
export async function startTopicVideoRenderWorkflow({
	podcastEpisodeId,
	renderVersion,
	isPlatformBilled,
}: StartTopicVideoRenderWorkflowOptions): Promise<void> {
	await startWorkflowOnce({
		workflow: TOPIC_VIDEO_WORKFLOW,
		taskQueue: TOPIC_VIDEO_TASK_QUEUE,
		workflowId: toTopicVideoWorkflowId(podcastEpisodeId),
		args: [{ podcastEpisodeId, renderVersion, isRestart: true, ...(isPlatformBilled ? { isPlatformBilled } : {}) }],
	})
}

/**
 * Starts the rebuild of a podcast episode's film for its current image on the rebuilds' own queue, named by the
 * podcast episode so a second start while one runs is ignored.
 */
export async function startTopicVideoRebuild(podcastEpisodeId: string): Promise<void> {
	await startWorkflowOnce({
		workflow: TOPIC_VIDEO_REBUILD_WORKFLOW,
		taskQueue: TOPIC_VIDEO_REBUILD_TASK_QUEUE,
		workflowId: toTopicVideoRebuildWorkflowId(podcastEpisodeId),
		args: [{ podcastEpisodeId }],
	})
}

// the started or joined film backfill, and a call that waits for its summary. it is a call, so a worker that only
// starts the backfill opens no long-poll
export type TopicVideoBackfillStart = {
	whenFinished: () => Promise<TopicVideoBackfillSummary>
}

/**
 * Starts the film backfill at a concurrency, or joins the one running.
 */
export async function startTopicVideoBackfillWorkflow(
	concurrency: number,
	selectedEpisodeId?: string,
): Promise<TopicVideoBackfillStart> {
	// A selected upgrade joins its own retry independently of the boot backfill.
	const workflowId = selectedEpisodeId
		? `${TOPIC_VIDEO_BACKFILL_WORKFLOW_ID}-v4-${selectedEpisodeId}`
		: TOPIC_VIDEO_BACKFILL_WORKFLOW_ID
	const client = await getClient()
	try {
		await withClientDeadline(client, () =>
			client.workflow.start(TOPIC_VIDEO_BACKFILL_WORKFLOW, {
				taskQueue: TOPIC_VIDEO_BACKFILL_TASK_QUEUE,
				workflowId,
				args: [selectedEpisodeId ? { concurrency: 1, selectedEpisodeId } : { concurrency }],
			}),
		)
	} catch (error) {
		// a backfill already running is joined, and anything else is a real failure
		if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
			throw error
		}
	}
	return { whenFinished: () => client.workflow.getHandle(workflowId).result() }
}

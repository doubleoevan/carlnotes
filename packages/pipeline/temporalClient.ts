// the Temporal client that the api and the sweep use to start durable workflows

import type { DashboardSubject } from "@carlnotes/contracts/dashboards"
import { DASHBOARD_REBUILD_SIGNAL } from "@carlnotes/contracts/dashboardWork"
import {
	PERSONAL_SOURCES_CONTEXT_SIGNAL,
	PERSONAL_SOURCES_EMAIL_TASK_QUEUE,
	PERSONAL_SOURCES_TASK_QUEUE,
} from "@carlnotes/contracts/personalSourcesWork"
import {
	TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_TASK_QUEUE,
	TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_WORKFLOW,
	TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_WORKFLOW_ID,
	TOPIC_PODCAST_EPISODE_VIDEO_REBUILD_WORKFLOW,
	TOPIC_PODCAST_EPISODE_VIDEO_TASK_QUEUE,
	type TopicPodcastEpisodeVideoBackfillSummary,
	toTopicPodcastEpisodeVideoRebuildWorkflowId,
} from "@carlnotes/contracts/topicPodcastEpisodeVideoWork"
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client"
import { CHAT_MENTION_PUSH_WORKFLOW, PUSH_TASK_QUEUE } from "./pushWorkflows"

// the task queue the attachment worker polls, and the workflow it runs started by name
export const ATTACHMENT_TASK_QUEUE = "attachment-processing"
const ATTACHMENT_WORKFLOW = "processAttachment"

// a url Source's screen gets its own queue because a Worker binds one workflow bundle to one queue
export const SOURCE_TASK_QUEUE = "source-screening"
const SOURCE_WORKFLOW = "screenSourceWorkflow"

// a Topic Post Discussion records on the podcast recordings' queue, which the worker's recording slots limit
const RECORDING_TASK_QUEUE = "episode-recordings"
const TOPIC_POST_DISCUSSION_WORKFLOW = "recordTopicPostDiscussionWorkflow"

// the topic post workflows' queue and names
export const TOPIC_POST_TASK_QUEUE = "topic-posts"
const TOPIC_POST_PUBLISH_WORKFLOW = "publishTopicPostWorkflow"
const TOPIC_POST_SUMMARY_WORKFLOW = "summarizeTopicPostWorkflow"

// the topic image workflows' queue and names, and the backfill's one id. a topic image render polls its own queue,
// and the backfill and its children share it
export const TOPIC_IMAGE_TASK_QUEUE = "topic-images"
const TOPIC_IMAGE_WORKFLOW = "renderTopicImageWorkflow"
const TOPIC_IMAGE_BACKFILL_WORKFLOW = "backfillTopicImagesWorkflow"
const TOPIC_IMAGE_BACKFILL_WORKFLOW_ID = "topic-image-backfill"

// the Dashboard build's queue and name
export const DASHBOARD_TASK_QUEUE = "dashboard-snapshots"
const DASHBOARD_WORKFLOW = "buildDashboardSnapshotsWorkflow"

// how long a connect, a workflow start, a cancel, and a task queue description may each take before it fails
const CLIENT_CALL_TIMEOUT_MS = 10_000

// the reused client promise, built on first use from the TEMPORAL_ADDRESS endpoint
let clientPromise: Promise<Client> | undefined

/**
 * Signals or starts the one private-context workflow for a Topic after a committed personal sources mutation.
 */
export async function startPersonalSourcesContextWorkflow(topicId: string): Promise<void> {
	const client = await getClient()
	await withClientDeadline(client, () =>
		client.workflow.signalWithStart("summarizePersonalSourcesContext", {
			taskQueue: PERSONAL_SOURCES_TASK_QUEUE,
			workflowId: `personal-sources-context-${topicId}`,
			args: [topicId],
			signal: PERSONAL_SOURCES_CONTEXT_SIGNAL,
			signalArgs: [],
		}),
	)
}

/**
 * Starts durable received-email work whose only argument is a persisted confirmation id.
 */
export async function startPersonalSourcesEmailWorkflow(confirmationId: string): Promise<void> {
	await startWorkflowOnce({
		workflow: "receivePersonalSourcesEmail",
		taskQueue: PERSONAL_SOURCES_EMAIL_TASK_QUEUE,
		workflowId: `personal-sources-email-${confirmationId}`,
		args: [confirmationId],
	})
}

/**
 * Starts the nightly Dashboard build for the last completed UTC day. A build that ran or runs under that day's id is
 * not started again, and only a failed one is.
 */
export async function startDashboardSnapshotsWorkflow(lastDay: string): Promise<void> {
	await startWorkflowOnce({
		workflow: DASHBOARD_WORKFLOW,
		taskQueue: DASHBOARD_TASK_QUEUE,
		workflowId: `dashboard-snapshots-${lastDay}`,
		args: [{ lastDay }],
		workflowIdReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
	})
}

/**
 * Starts one Dashboard's rebuild, named by the Dashboard, or signals the rebuild already running to build again once
 * its current build ends.
 */
export async function startDashboardRebuildWorkflow(subject: DashboardSubject, lastDay: string): Promise<void> {
	const client = await getClient()
	await withClientDeadline(client, () =>
		client.workflow.signalWithStart(DASHBOARD_WORKFLOW, {
			taskQueue: DASHBOARD_TASK_QUEUE,
			workflowId: `dashboard-rebuild-${subject.dashboardKind}-${subject.subjectId}`,
			args: [{ lastDay, subject }],
			signal: DASHBOARD_REBUILD_SIGNAL,
			signalArgs: [lastDay],
		}),
	)
}

// one workflow to start: its name, the queue it runs on, its id, the arguments it takes, and whether a closed workflow
// under its id may run again
type StartWorkflowOnceOptions = {
	workflow: string
	taskQueue: string
	workflowId: string
	args: unknown[]
	workflowIdReusePolicy?: "ALLOW_DUPLICATE_FAILED_ONLY"
}

// start one workflow under its id, under the call deadline. a workflow already started under that id needs no second
// start, and anything else is a real failure
async function startWorkflowOnce({ workflow, ...workflowOptions }: StartWorkflowOnceOptions): Promise<void> {
	const client = await getClient()
	try {
		await withClientDeadline(client, () => client.workflow.start(workflow, workflowOptions))
	} catch (error) {
		// swallow the duplicate id, and raise anything else
		if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
			throw error
		}
	}
}

// start the durable processing workflow for a freshly stored attachment
export async function startAttachmentWorkflow(attachmentId: string): Promise<void> {
	// the workflow id is derived from the attachment id
	const client = await getClient()
	await withClientDeadline(client, () =>
		client.workflow.start(ATTACHMENT_WORKFLOW, {
			taskQueue: ATTACHMENT_TASK_QUEUE,
			workflowId: `attachment-${attachmentId}`,
			args: [attachmentId],
		}),
	)
}

/**
 * Starts the url Source screen workflow for a url Source that was just saved.
 * A Source whose check is already running is rejected by its workflow id, which makes a restart safe to repeat.
 */
export async function startSourceScreenWorkflow(sourceId: string): Promise<void> {
	await startWorkflowOnce({
		workflow: SOURCE_WORKFLOW,
		taskQueue: SOURCE_TASK_QUEUE,
		workflowId: `source-${sourceId}`,
		args: [sourceId],
	})
}

// a render to start: its topic, its render row, and the owner's image prompt, which only the workflow carries
export type StartTopicImageWorkflowOptions = { topicId: string; renderId: string; imagePrompt?: string }

/**
 * Starts what follows a Topic Post's publish, named by the post so a second start for it is ignored.
 */
export function startTopicPostPublishWorkflow(topicPostId: string): Promise<void> {
	return startTopicPostWorkflow(TOPIC_POST_PUBLISH_WORKFLOW, `topic-post-publish-${topicPostId}`, topicPostId)
}

/**
 * Starts the rewrite of a published Topic Post's summary after an edit, named by the post so the edits saved while
 * one waits share it.
 */
export function startTopicPostSummaryWorkflow(topicPostId: string): Promise<void> {
	return startTopicPostWorkflow(TOPIC_POST_SUMMARY_WORKFLOW, `topic-post-summary-${topicPostId}`, topicPostId)
}

// a discussion's row, and the starter's note for the hosts, which goes to the workflow and never to a row
type StartTopicPostDiscussionWorkflowOptions = { discussionId: string; hint?: string }

/**
 * Starts a Topic Post Discussion's recording, named by its row so a second start for the row is ignored.
 */
export async function startTopicPostDiscussionWorkflow({
	discussionId,
	hint,
}: StartTopicPostDiscussionWorkflowOptions): Promise<void> {
	await startWorkflowOnce({
		workflow: TOPIC_POST_DISCUSSION_WORKFLOW,
		taskQueue: RECORDING_TASK_QUEUE,
		workflowId: `topic-post-discussion-${discussionId}`,
		args: [{ discussionId, hint }],
	})
}

// start one Topic Post workflow under its id, on the topic post queue
function startTopicPostWorkflow(workflow: string, workflowId: string, topicPostId: string): Promise<void> {
	return startWorkflowOnce({
		workflow,
		taskQueue: TOPIC_POST_TASK_QUEUE,
		workflowId,
		args: [{ topicPostId }],
	})
}

/**
 * Starts a topic image render, named by its render row so a second start for the row is ignored.
 */
export async function startTopicImageWorkflow({
	topicId,
	renderId,
	imagePrompt,
}: StartTopicImageWorkflowOptions): Promise<void> {
	await startWorkflowOnce({
		workflow: TOPIC_IMAGE_WORKFLOW,
		taskQueue: TOPIC_IMAGE_TASK_QUEUE,
		workflowId: `topic-image-${renderId}`,
		args: [{ topicId, renderId, imagePrompt }],
	})
}

// what the backfill does, and what it did
export type TopicImageBackfillMode = "missing" | "redo" | "resize"
export type TopicImageBackfillSummary = { topicCount: number; failedCount: number }

/**
 * Starts the topic image backfill, or joins the one running, and returns its summary once it ends.
 */
export async function startTopicImageBackfillWorkflow({
	mode,
}: {
	mode: TopicImageBackfillMode
}): Promise<TopicImageBackfillSummary> {
	// start the backfill under its fixed id, or take the handle of the one running
	const client = await getClient()
	try {
		const workflowHandle = await withClientDeadline(client, () =>
			client.workflow.start(TOPIC_IMAGE_BACKFILL_WORKFLOW, {
				taskQueue: TOPIC_IMAGE_TASK_QUEUE,
				workflowId: TOPIC_IMAGE_BACKFILL_WORKFLOW_ID,
				args: [{ mode }],
			}),
		)
		return await workflowHandle.result()
	} catch (error) {
		// a backfill already running is joined, and anything else is a real failure
		if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
			throw error
		}
		return client.workflow.getHandle<typeof startTopicImageBackfillWorkflow>(TOPIC_IMAGE_BACKFILL_WORKFLOW_ID).result()
	}
}

/**
 * Starts the rebuild of a podcast episode's film for its current image, named by the podcast episode so a second
 * start while one runs is ignored.
 */
export async function startTopicPodcastEpisodeVideoRebuild(podcastEpisodeId: string): Promise<void> {
	await startWorkflowOnce({
		workflow: TOPIC_PODCAST_EPISODE_VIDEO_REBUILD_WORKFLOW,
		taskQueue: TOPIC_PODCAST_EPISODE_VIDEO_TASK_QUEUE,
		workflowId: toTopicPodcastEpisodeVideoRebuildWorkflowId(podcastEpisodeId),
		args: [{ podcastEpisodeId }],
	})
}

// the started or joined film backfill, and a call that waits for its summary. it is a call, so a worker that only
// starts the backfill opens no long-poll
export type TopicPodcastEpisodeVideoBackfillStart = {
	whenFinished: () => Promise<TopicPodcastEpisodeVideoBackfillSummary>
}

/**
 * Starts the film backfill at a concurrency, or joins the one running.
 */
export async function startTopicPodcastEpisodeVideoBackfillWorkflow(
	concurrency: number,
): Promise<TopicPodcastEpisodeVideoBackfillStart> {
	// start the backfill under its fixed id
	const client = await getClient()
	const toBackfillStart = (): TopicPodcastEpisodeVideoBackfillStart => ({
		whenFinished: () => client.workflow.getHandle(TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_WORKFLOW_ID).result(),
	})
	try {
		await withClientDeadline(client, () =>
			client.workflow.start(TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_WORKFLOW, {
				taskQueue: TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_TASK_QUEUE,
				workflowId: TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_WORKFLOW_ID,
				args: [{ concurrency }],
			}),
		)
	} catch (error) {
		// a backfill already running is joined, and anything else is a real failure
		if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
			throw error
		}
	}
	return toBackfillStart()
}

/**
 * Starts the push of a room message's chat mentions, named by the message so a second start for it is ignored.
 */
export async function startChatMentionPushWorkflow(chatMessageId: number): Promise<void> {
	await startWorkflowOnce({
		workflow: CHAT_MENTION_PUSH_WORKFLOW,
		taskQueue: PUSH_TASK_QUEUE,
		workflowId: `chat-mention-push-${chatMessageId}`,
		args: [{ chatMessageId }],
	})
}

// run one client call under the call deadline, so a server that never answers fails the call instead of the request
export function withClientDeadline<Result>(client: Client, runCall: () => Promise<Result>): Promise<Result> {
	return client.connection.withDeadline(Date.now() + CLIENT_CALL_TIMEOUT_MS, runCall)
}

// the reused Temporal client instance, connected to the TEMPORAL_ADDRESS endpoint on first use
export function getClient(): Promise<Client> {
	// connect once and reuse the client, giving the connect the call deadline. clear a failed connection so the next
	// call connects again
	clientPromise ??= Connection.connect({ address: Bun.env.TEMPORAL_ADDRESS, connectTimeout: CLIENT_CALL_TIMEOUT_MS })
		.then((connection) => new Client({ connection }))
		.catch((error: unknown) => {
			clientPromise = undefined
			throw error
		})
	return clientPromise
}

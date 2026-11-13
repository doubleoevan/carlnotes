// the Topic Post workflows: what follows a publish, and the summary's rewrite after an edit. every step is best
// effort, so a failed step leaves the post published as it is

import { TOPIC_POST_DISCUSSION_WAIT_MS } from "@carlnotes/contracts/topicPosts"
import { patched, proxyActivities, sleep } from "@temporalio/workflow"
import type * as activities from "./publishTopicPostActivities"

// how long an edit's summary rewrite waits, so the saves of one stretch of typing share one summary
const SUMMARY_QUIET_MS = 30 * 1000

// the patch that waits before an edit's summary. a workflow already running before it skips the wait on replay
const SUMMARY_QUIET_WAIT_PATCH = "topic-post-summary-quiet-wait"

// the summary is one short text call with three attempts
const SUMMARY_TIMEOUT_MS = 2 * 60 * 1000
const SUMMARY_ATTEMPTS = 3

// a start is a row and a workflow start, with three attempts
const START_TIMEOUT_MS = 60 * 1000
const START_ATTEMPTS = 3

// the summary writer fails for good on a spent budget, and retries anything else
const { writeTopicPostSummary } = proxyActivities<typeof activities>({
	startToCloseTimeout: SUMMARY_TIMEOUT_MS,
	retry: { maximumAttempts: SUMMARY_ATTEMPTS },
})

// the image's render row and the discussion's row, each with the start of its own workflow, are short writes
const { startTopicPostImageRender, startTopicPostPublishDiscussionActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: START_TIMEOUT_MS,
	retry: { maximumAttempts: START_ATTEMPTS },
})

// the published Topic Post
export type TopicPostWorkflowInput = { topicPostId: string }

/**
 * Runs what follows a Topic Post's publish: its summary at once, the render of its image, and, 15 minutes later, the
 * start of its first discussion. A failed step blocks nothing.
 */
export async function publishTopicPostWorkflow({ topicPostId }: TopicPostWorkflowInput): Promise<void> {
	// the summary of the text as published, then the image
	await runBestEffort(() => writeTopicPostSummary(topicPostId))
	await runBestEffort(() => startTopicPostImageRender(topicPostId))

	// the discussion waits 15 minutes, so a correction made right after the publish reaches the recording
	await sleep(TOPIC_POST_DISCUSSION_WAIT_MS)
	await runBestEffort(() => startTopicPostPublishDiscussionActivity(topicPostId))
}

/**
 * Writes a published Topic Post's summary again after its author edited it, once per quiet wait: the edits saved
 * while it waits share the one summary of the stored text. A failure keeps the summary it had.
 */
export async function summarizeTopicPostWorkflow({ topicPostId }: TopicPostWorkflowInput): Promise<void> {
	// wait for the saves of one stretch of typing, then summarize the text as it is stored
	if (patched(SUMMARY_QUIET_WAIT_PATCH)) {
		await sleep(SUMMARY_QUIET_MS)
	}
	await runBestEffort(() => writeTopicPostSummary(topicPostId))
}

// run one step and return what it returns, or null if it fails for good, so the workflow goes on
async function runBestEffort<StepResult>(runStep: () => Promise<StepResult>): Promise<StepResult | null> {
	try {
		return await runStep()
	} catch {
		return null
	}
}

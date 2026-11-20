// the Topic Post Discussion workflow: write the script, then record, encode, and publish it. a failure closes the
// discussion's row alone, and the Topic Post stays as it is

import { toWorkflowFailureReason } from "@carlnotes/contracts/scanFailure"
import {
	DISCUSSION_RECORDING_RETRY_POLICY,
	DISCUSSION_RECORDING_TIMEOUT_MS,
	DISCUSSION_SCRIPT_ATTEMPTS,
	DISCUSSION_SCRIPT_TIMEOUT_MS,
	HEARTBEAT_TIMEOUT_MS,
	SHORT_WRITE_ATTEMPTS,
	SHORT_WRITE_TIMEOUT_MS,
} from "@carlnotes/pipeline/stageTimeouts"
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./recordTopicPostDiscussionActivities"

// the script writer fails for good on a spent budget, a post that is gone, and a rejected script
const { writeTopicPostDiscussionScriptActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: DISCUSSION_SCRIPT_TIMEOUT_MS,
	retry: { maximumAttempts: DISCUSSION_SCRIPT_ATTEMPTS },
})

// the recording fails for good on a speech failure another attempt cannot fix. it heartbeats, so a recording whose
// worker was killed is tried again after two minutes instead of ten
const { recordTopicPostDiscussionAudioActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: DISCUSSION_RECORDING_TIMEOUT_MS,
	heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
	retry: DISCUSSION_RECORDING_RETRY_POLICY,
})

// the failure write may retry
const { failTopicPostDiscussionActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: SHORT_WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: SHORT_WRITE_ATTEMPTS },
})

// the discussion's row, and the starter's note for the hosts
type RecordTopicPostDiscussionWorkflowInput = { discussionId: string; hint?: string }

/**
 * Records a Topic Post's discussion end to end, closing its row as failed on any failure.
 */
export async function recordTopicPostDiscussionWorkflow({
	discussionId,
	hint,
}: RecordTopicPostDiscussionWorkflowInput): Promise<void> {
	try {
		// the script from the post and its shared Comments, then the one recording of it
		await writeTopicPostDiscussionScriptActivity({ discussionId, hint })
		await recordTopicPostDiscussionAudioActivity(discussionId)
	} catch (error) {
		await failTopicPostDiscussionActivity(discussionId, toWorkflowFailureReason(error))
		throw error
	}
}

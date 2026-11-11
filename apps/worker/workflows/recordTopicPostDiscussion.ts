// the Topic Post Discussion workflow: write the script, then record, encode, and publish it. a failure closes the
// discussion's row alone, and the Topic Post stays as it is

import { toWorkflowFailureReason } from "@carlnotes/contracts/scanFailure"
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./recordTopicPostDiscussionActivities"

// the script is up to three drafts of one model call each
const SCRIPT_TIMEOUT_MS = 5 * 60 * 1000
const SCRIPT_ATTEMPTS = 2

// the recording is one speech call, an ffmpeg pass, and an upload. its retries back off from 30 seconds
const RECORDING_TIMEOUT_MS = 10 * 60 * 1000
const RECORDING_RETRY_POLICY = { initialInterval: 30 * 1000, backoffCoefficient: 2, maximumInterval: 5 * 60 * 1000 }
const RECORDING_ATTEMPTS = 3

// the failure write is short and idempotent
const WRITE_TIMEOUT_MS = 60 * 1000
const WRITE_ATTEMPTS = 3

// the script writer fails for good on a spent budget, a post that is gone, and a rejected script
const { writeTopicPostDiscussionScriptActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: SCRIPT_TIMEOUT_MS,
	retry: { maximumAttempts: SCRIPT_ATTEMPTS },
})

// the recording fails for good on a speech failure another attempt cannot fix
const { recordTopicPostDiscussionAudioActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: RECORDING_TIMEOUT_MS,
	retry: { ...RECORDING_RETRY_POLICY, maximumAttempts: RECORDING_ATTEMPTS },
})

// the failure write may retry
const { failTopicPostDiscussionActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: WRITE_ATTEMPTS },
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

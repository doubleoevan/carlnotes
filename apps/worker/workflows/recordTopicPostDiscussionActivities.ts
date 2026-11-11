// Topic Post Discussion activities: the script call, the speech call with its encode and store, and the failure
// write. they run in the worker process, not the sandbox

import { isBudgetRejection } from "@carlnotes/models/models"
import { SpeechFailedError } from "@carlnotes/pipeline/podcast/podcastEpisodeAudio"
import { RejectedScriptError } from "@carlnotes/pipeline/podcast/podcastEpisodeScript"
import {
	failTopicPostDiscussion,
	recordTopicPostDiscussionAudio,
	TopicPostDiscussionError,
	writeTopicPostDiscussionScript,
} from "@carlnotes/pipeline/topicPosts/topicPostDiscussions"
import { ApplicationFailure } from "@temporalio/activity"

// the discussion's row and the starter's note
type WriteDiscussionScriptOptions = { discussionId: string; hint?: string }

/**
 * Writes the discussion's script on its user's key. A post that is gone, a spent budget, and a last draft that fails
 * its checks fail for good.
 */
export async function writeTopicPostDiscussionScriptActivity({
	discussionId,
	hint,
}: WriteDiscussionScriptOptions): Promise<void> {
	try {
		await writeTopicPostDiscussionScript(discussionId, hint)
	} catch (error) {
		throw toDiscussionActivityFailure(error)
	}
}

/**
 * Records, encodes, stores, and publishes the discussion. A speech failure another attempt cannot fix, and a spent
 * budget, fail for good.
 */
export async function recordTopicPostDiscussionAudioActivity(discussionId: string): Promise<void> {
	try {
		await recordTopicPostDiscussionAudio(discussionId)
	} catch (error) {
		throw toDiscussionActivityFailure(error)
	}
}

/**
 * Closes the discussion's row as failed, with why.
 */
export async function failTopicPostDiscussionActivity(discussionId: string, reason: string): Promise<void> {
	await failTopicPostDiscussion(discussionId, reason)
}

// the activity failure of a discussion step: final for a spent budget, a post that is gone, a rejected script, and a
// speech failure that is not retryable, and the error as it is for anything another attempt may fix
function toDiscussionActivityFailure(error: unknown): unknown {
	// a spent budget is final until the month resets
	const isBudgetSpent = isBudgetRejection(error) || (error instanceof TopicPostDiscussionError && error.isBudgetSpent)
	if (isBudgetSpent) {
		return ApplicationFailure.nonRetryable("the user's budget is spent", "BudgetSpent")
	}

	// a post that is gone and a script no draft got right have nothing another attempt can change
	if (error instanceof TopicPostDiscussionError) {
		return ApplicationFailure.nonRetryable(error.message, "DiscussionNotRecordable")
	}
	if (error instanceof RejectedScriptError) {
		return ApplicationFailure.nonRetryable(error.message, "RejectedScript")
	}

	// a speech failure says whether another attempt can help
	if (error instanceof SpeechFailedError) {
		return ApplicationFailure.create({ message: error.message, type: "SpeechFailed", nonRetryable: !error.isRetryable })
	}
	return error
}

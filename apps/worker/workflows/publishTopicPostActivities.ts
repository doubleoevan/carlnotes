// Topic Post publish activities: the summary's write, the start of the image's render, and the start of the first
// discussion. they run in the worker process, not the sandbox

import { isBudgetRejection } from "@carlnotes/models/models"
import { startTopicPostPublishDiscussion } from "@carlnotes/pipeline/topicPosts/topicPostDiscussions"
import { startTopicPostCreateImageRender } from "@carlnotes/pipeline/topicPosts/topicPostImageRenders"
import { writeStoredTopicPostSummary } from "@carlnotes/pipeline/topicPosts/topicPostSummaries"
import { ApplicationFailure } from "@temporalio/activity"

/**
 * Starts the render that draws a published Topic Post its first image, billed to its author. The render runs as its
 * own workflow, and a post that already has an image starts none.
 */
export async function startTopicPostImageRender(topicPostId: string): Promise<void> {
	await startTopicPostCreateImageRender(topicPostId)
}

/**
 * Starts a published Topic Post's first discussion, billed to its author. A post that is gone, and one that already
 * has a discussion, starts none.
 */
export async function startTopicPostPublishDiscussionActivity(topicPostId: string): Promise<void> {
	await startTopicPostPublishDiscussion(topicPostId)
}

/**
 * Writes and stores a published Topic Post's summary, billed to its author. A spent budget fails for good.
 */
export async function writeTopicPostSummary(topicPostId: string): Promise<void> {
	try {
		await writeStoredTopicPostSummary(topicPostId)
	} catch (error) {
		// a spent budget is final until the month resets
		if (isBudgetRejection(error)) {
			throw ApplicationFailure.nonRetryable("the author's budget is spent", "BudgetSpent")
		}
		throw error
	}
}

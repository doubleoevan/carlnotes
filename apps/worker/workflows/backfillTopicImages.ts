// the topic image backfill: one workflow that gives every topic an image, a few renders at a time, on the platform
// key. a second start joins the one running, and each mode is safe to run again

import type { TopicImageBackfillMode, TopicImageBackfillSummary } from "@carlnotes/pipeline/temporalClient"
import { continueAsNew, executeChild, isCancellation, ParentClosePolicy, proxyActivities } from "@temporalio/workflow"
import type { BackfillTopicCursor } from "./backfillTopicCursor"
import type * as activities from "./backfillTopicImagesActivities"
import type { RenderTopicImageWorkflowInput } from "./renderTopicImage"
import { renderTopicImageWorkflow } from "./renderTopicImage"

// how many topics render or resize at once, and how many one run of the workflow takes before it continues as a new
// run
const BACKFILL_CONCURRENCY = 3
const BACKFILL_PAGE_SIZE = 300

// the listing and the render row writes are short, and the resize reads and writes seven objects
const WRITE_TIMEOUT_MS = 2 * 60 * 1000
const RESIZE_TIMEOUT_MS = 5 * 60 * 1000
const WRITE_ATTEMPTS = 3

// the backfill's input: the mode, and on a continued run the page cursor and the counts so far
export type BackfillTopicImagesWorkflowInput = {
	mode: TopicImageBackfillMode
	afterTopic?: BackfillTopicCursor
	summary?: TopicImageBackfillSummary
}

// the listing and the render row writes may retry
const { listBackfillTopicIds, startBackfillRender } = proxyActivities<typeof activities>({
	startToCloseTimeout: WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: WRITE_ATTEMPTS },
})

// a resize reads the original and writes the files, and may retry
const { rederiveBackfillTopicImageFiles } = proxyActivities<typeof activities>({
	startToCloseTimeout: RESIZE_TIMEOUT_MS,
	retry: { maximumAttempts: WRITE_ATTEMPTS },
})

/**
 * Backfills every topic the mode names, public topics first, a few at a time, and returns what it did.
 */
export async function backfillTopicImagesWorkflow({
	mode,
	afterTopic,
	summary = { topicCount: 0, failedCount: 0 },
}: BackfillTopicImagesWorkflowInput): Promise<TopicImageBackfillSummary> {
	// one page of the topics the mode names, public first
	const topicPage = await listBackfillTopicIds({ mode, afterTopic, limit: BACKFILL_PAGE_SIZE })
	let failedCount = summary.failedCount

	// run the topics a few at a time, each as its own child
	for (let index = 0; index < topicPage.topicIds.length; index += BACKFILL_CONCURRENCY) {
		const batchTopicIds = topicPage.topicIds.slice(index, index + BACKFILL_CONCURRENCY)
		const outcomes = await Promise.all(batchTopicIds.map((topicId) => runBackfillTopic({ topicId, mode })))
		failedCount += outcomes.filter((isSucceeded) => !isSucceeded).length
	}

	// a full page means more may follow, so the next run picks up after this page's last topic
	const pageSummary = { topicCount: summary.topicCount + topicPage.topicIds.length, failedCount }
	if (topicPage.nextCursor) {
		await continueAsNew<typeof backfillTopicImagesWorkflow>({
			mode,
			afterTopic: topicPage.nextCursor,
			summary: pageSummary,
		})
	}
	return pageSummary
}

// one topic's backfill: a render as a child workflow, or a resize activity. returns whether it succeeded
async function runBackfillTopic({
	topicId,
	mode,
}: {
	topicId: string
	mode: TopicImageBackfillMode
}): Promise<boolean> {
	try {
		// a resize derives the files again with no model call
		if (mode === "resize") {
			await rederiveBackfillTopicImageFiles(topicId)
			return true
		}

		// a render gets its row, then runs as a child on the same queue
		const renderInput: RenderTopicImageWorkflowInput = await startBackfillRender({ topicId })
		await executeChild(renderTopicImageWorkflow, {
			workflowId: `topic-image-${renderInput.renderId}`,
			args: [renderInput],
			parentClosePolicy: ParentClosePolicy.TERMINATE,
		})
		return true
	} catch (error) {
		// a cancelled backfill stops here. any other failure, the child's or the row write's, is counted and the
		// backfill moves on
		if (isCancellation(error)) {
			throw error
		}
		return false
	}
}

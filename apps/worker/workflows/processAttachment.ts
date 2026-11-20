// the attachment processing workflow

import { toWorkflowFailureReason } from "@carlnotes/contracts/scanFailure"
import { ATTACHMENT_STEP_RETRY_POLICY, ATTACHMENT_STEP_TIMEOUT_MS } from "@carlnotes/pipeline/stageTimeouts"
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./processAttachmentActivities"

// every step gets the same generous timeout and retries, for extraction and the per-chunk model calls
const { extractAttachmentText, summarizeChunk, finalizeAttachment, finalizeVerbatimAttachment, failAttachment } =
	proxyActivities<typeof activities>({
		startToCloseTimeout: ATTACHMENT_STEP_TIMEOUT_MS,
		retry: ATTACHMENT_STEP_RETRY_POLICY,
	})

/** Processes an attachment end to end, compensating with a failed status and object cleanup on error. */
export async function processAttachment(attachmentId: string): Promise<void> {
	try {
		// extract the text, then either store it as written or summarize chunks and merge
		const { chunks, charCount, verbatimContext } = await extractAttachmentText(attachmentId)

		// table text and a short document were settled at extraction and are stored with no model call
		if (verbatimContext !== null) {
			await finalizeVerbatimAttachment(attachmentId, verbatimContext, charCount)
			return
		}
		const summaries = await Promise.all(chunks.map((chunkText) => summarizeChunk(attachmentId, chunkText)))
		await finalizeAttachment(attachmentId, summaries, charCount, chunks.length)
	} catch (error) {
		// on error mark failed and delete the stored object, then fail the workflow
		await failAttachment(attachmentId, toWorkflowFailureReason(error))
		throw error
	}
}

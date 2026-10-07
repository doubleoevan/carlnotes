// the attachment processing workflow
import { proxyActivities } from "@temporalio/workflow"
import { toWorkflowFailureReason } from "../../shared/scanFailure"
import type * as activities from "./processAttachmentActivities"

// activity proxies with a generous timeout for extraction and the per-chunk model calls.
// the retries wait 15 and then 30 seconds, so a busy scanner or model has time to free up
const { extractAttachmentText, summarizeChunk, finalizeAttachment, finalizeVerbatimAttachment, failAttachment } =
	proxyActivities<typeof activities>({
		startToCloseTimeout: "5 minutes",
		retry: { maximumAttempts: 3, initialInterval: "15 seconds", backoffCoefficient: 2 },
	})

/** Processes an attachment end to end, compensating with a failed status and object cleanup on error. */
export async function processAttachment(attachmentId: string): Promise<void> {
	try {
		// extract and screen with llm-guard, then either store the text as written or summarize chunks and merge
		const { chunks, charCount, flaggedReason, verbatimContext } = await extractAttachmentText(attachmentId)

		// fail the attachment if it was flagged by the scanner so it doesn't get retried
		if (flaggedReason) {
			await failAttachment(attachmentId, flaggedReason)
			return
		}

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

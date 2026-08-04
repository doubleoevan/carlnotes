// the attachment processing workflow. it decides the order and calls activities, never doing I/O itself.
// extract and chunk, summarize the chunks in parallel, then finalize and mark ready. a failure marks the attachment failed
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./process-attachment-activities"

// activity proxies with a generous timeout for extraction and the per-chunk model calls.
// the attempt cap is what stops a permanently failing attachment from retrying for the life of the worker.
// an attachment that no longer exists gives up on the first attempt
const { extractAttachmentText, summarizeChunk, finalizeAttachment, failAttachment } = proxyActivities<
	typeof activities
>({
	startToCloseTimeout: "5 minutes",
	retry: { maximumAttempts: 3 },
})

// attempt to process an attachment end to end, compensating with a failed status and object cleanup on error
export async function processAttachment(attachmentId: string): Promise<void> {
	try {
		// extract and chunk, summarize each chunk in parallel, then merge and mark ready
		const { chunks, charCount, flaggedReason } = await extractAttachmentText(attachmentId)

		// fail the attachment if it was flagged by the scanner so it doesn't get retried
		if (flaggedReason) {
			await failAttachment(attachmentId, flaggedReason)
			return
		}
		const summaries = await Promise.all(chunks.map((chunkText) => summarizeChunk(attachmentId, chunkText)))
		await finalizeAttachment(attachmentId, summaries, charCount, chunks.length)
	} catch (error) {
		// on error mark failed and delete the stored object, then fail the workflow
		await failAttachment(attachmentId, error instanceof Error ? error.message : String(error))
		throw error
	}
}

// the attachment processing workflow
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./process-attachment-activities"

// activity proxies with a generous timeout for extraction and the per-chunk model calls
const { extractAttachmentText, summarizeChunk, finalizeAttachment, finalizeTableAttachment, failAttachment } =
	proxyActivities<typeof activities>({
		startToCloseTimeout: "5 minutes",
		retry: { maximumAttempts: 3 },
	})

/** Processes an attachment end to end, compensating with a failed status and object cleanup on error. */
export async function processAttachment(attachmentId: string): Promise<void> {
	try {
		// extract and screen with llm-guard, then either store table text or summarize chunks and merge
		const { chunks, charCount, flaggedReason, tableContext } = await extractAttachmentText(attachmentId)

		// fail the attachment if it was flagged by the scanner so it doesn't get retried
		if (flaggedReason) {
			await failAttachment(attachmentId, flaggedReason)
			return
		}

		// a table file's context was computed at extraction, so it gets stored with no model call
		if (tableContext !== null) {
			await finalizeTableAttachment(attachmentId, tableContext, charCount)
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

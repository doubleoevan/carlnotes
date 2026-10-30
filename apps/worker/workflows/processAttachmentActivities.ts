// attachment processing activities: the I/O steps the workflow calls. they run in the worker process, not the sandbox
import { ATTACHMENT_NO_TEXT_REASON, MAX_ATTACHMENT_CONTEXT_CHARS } from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { attachments } from "@carlnotes/db/schema/topics"
import { deleteStoredObject, getAttachmentBytes, recordPendingObjectDeletions } from "@carlnotes/db/store"
import { loadOrProvisionTopicOwnerLiteLLMKey } from "@carlnotes/models/litellm"
import { generateAttachmentContext, generateImageContext, toDataUrl } from "@carlnotes/pipeline/attach"
import { isImageAttachmentType, isTableFileType } from "@carlnotes/pipeline/attachContentType"
import { toTableText } from "@carlnotes/pipeline/attachTable"
import { extractText } from "@carlnotes/pipeline/attachText"
import { CHUNK_CHARS, chunk, MAX_CHUNKS } from "@carlnotes/pipeline/chunk"
import { ApplicationFailure } from "@temporalio/activity"
import { eq } from "drizzle-orm"

// the most characters the workflow can process, so that chunk payloads stay well under Temporal's per-message limit
const MAX_PROCESS_CHARS = MAX_CHUNKS * CHUNK_CHARS

// the extracted attachment chunks and total size, or the context stored as written
export type ExtractedAttachment = { chunks: string[]; charCount: number; verbatimContext: string | null }

/**
 * Extracts the stored file's text, and returns the text as written or as chunks to summarize.
 */
export async function extractAttachmentText(attachmentId: string): Promise<ExtractedAttachment> {
	// load the row for its object key and content type, then read and extract the stored bytes
	const [attachment] = await db.select().from(attachments).where(eq(attachments.id, attachmentId))
	if (!attachment) {
		throw ApplicationFailure.nonRetryable(`attachment ${attachmentId} not found`, "AttachmentNotFound")
	}
	const bytes = await getAttachmentBytes(attachment.objectKey)

	// an image has no text to extract
	const extractedText = isImageAttachmentType(attachment.contentType)
		? await generateImageContext(
				toDataUrl(attachment.contentType, bytes),
				await loadOrProvisionTopicOwnerLiteLLMKey(attachment.topicId),
			)
		: await extractText(attachment.contentType, bytes)

	// fail a file with no readable text, like a scanned PDF or a chart-only workbook
	if (!extractedText.trim()) {
		throw ApplicationFailure.nonRetryable(ATTACHMENT_NO_TEXT_REASON, "NoReadableText")
	}

	// a table file's rows are written as table text, with no model call
	if (isTableFileType(attachment.contentType)) {
		const tableContext = toTableText({
			serializedText: extractedText,
			filename: attachment.filename,
			contentType: attachment.contentType,
		})
		return { chunks: [], charCount: extractedText.length, verbatimContext: tableContext }
	}

	// a short document is its own context, with no model call
	if (extractedText.length <= MAX_ATTACHMENT_CONTEXT_CHARS) {
		return { chunks: [], charCount: extractedText.length, verbatimContext: extractedText }
	}

	// a longer document is cut to the processing limit, with the cut marked
	const markedText =
		extractedText.length > MAX_PROCESS_CHARS
			? `${extractedText.slice(0, MAX_PROCESS_CHARS)}${toCutMarker(extractedText.length)}`
			: extractedText

	// chunk the text to summarize
	const chunks = chunk(markedText, MAX_CHUNKS, CHUNK_CHARS)
	return { chunks, charCount: extractedText.length, verbatimContext: null }
}

// the line appended where a long document was cut
function toCutMarker(fullLength: number): string {
	const keptChars = MAX_PROCESS_CHARS.toLocaleString("en-US")
	return `\n\n[The document is cut here. It runs ${fullLength.toLocaleString("en-US")} characters and only the first ${keptChars} are included.]`
}

// summarize one chunk into a context note with the cheap model, billed to the topic owner's key
export async function summarizeChunk(attachmentId: string, chunkText: string): Promise<string> {
	// read the attachment's topic, and fail an attachment that is gone
	const [attachment] = await db
		.select({ topicId: attachments.topicId })
		.from(attachments)
		.where(eq(attachments.id, attachmentId))
	if (!attachment) {
		throw ApplicationFailure.nonRetryable(`attachment ${attachmentId} not found`, "AttachmentNotFound")
	}

	// write the summary with the topic owner's key
	return generateAttachmentContext(chunkText, await loadOrProvisionTopicOwnerLiteLLMKey(attachment.topicId))
}

// merge the chunk summaries into one limited context, mark the attachment ready, and record its counts
export async function finalizeAttachment(
	attachmentId: string,
	summaries: string[],
	charCount: number,
	chunkCount: number,
): Promise<void> {
	// join the per-chunk notes and limit the merged context, then flip the attachment to ready
	const context = summaries.join("\n\n").slice(0, MAX_ATTACHMENT_CONTEXT_CHARS)
	await markAttachmentReady(attachmentId, context, charCount, chunkCount)
}

/** Stores table text or a short document as written. The merged-context slice would cut table text mid-row. */
export async function finalizeVerbatimAttachment(
	attachmentId: string,
	verbatimContext: string,
	charCount: number,
): Promise<void> {
	await markAttachmentReady(attachmentId, verbatimContext, charCount, 0)
}

// flip the attachment to ready with its settled context and counts
async function markAttachmentReady(
	attachmentId: string,
	context: string,
	charCount: number,
	chunkCount: number,
): Promise<void> {
	await db
		.update(attachments)
		.set({ status: "ready", context, error: null, charCount, chunkCount })
		.where(eq(attachments.id, attachmentId))
}

// mark an attachment failed with the reason and delete its stored object
export async function failAttachment(attachmentId: string, message: string): Promise<void> {
	// record the failure and the object's key as pending in one transaction
	const objectKey = await db.transaction(async (transaction) => {
		// the attachment's key, and the failure on its row
		const [attachment] = await transaction
			.select({ objectKey: attachments.objectKey })
			.from(attachments)
			.where(eq(attachments.id, attachmentId))
		await transaction
			.update(attachments)
			.set({ status: "failed", error: message })
			.where(eq(attachments.id, attachmentId))

		// the key as pending, if the attachment exists
		if (attachment) {
			await recordPendingObjectDeletions({ handle: transaction, objectKeys: [attachment.objectKey] })
		}
		return attachment?.objectKey ?? null
	})

	// delete the object once the row is marked
	if (objectKey) {
		await deleteStoredObject(objectKey)
	}
}

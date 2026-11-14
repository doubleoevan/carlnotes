// attachment processing activities: the I/O steps the workflow calls. they run in the worker process, not the sandbox,
// and a file's text is extracted in a child process of the worker

import { MAX_ATTACHMENT_CONTEXT_CHARS } from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { attachments } from "@carlnotes/db/schema/topics"
import { deleteStoredObject, getAttachmentBytes, recordPendingObjectDeletions } from "@carlnotes/db/store"
import { loadOrProvisionTopicOwnerLiteLLMKey } from "@carlnotes/models/litellm"
import { generateAttachmentContext, generateImageContext } from "@carlnotes/pipeline/attach"
import { AttachmentValidationError, isImageAttachmentType } from "@carlnotes/pipeline/attachContentType"
import {
	AttachmentExtractionLimitError,
	type ExtractedAttachment,
	extractTopicAttachment,
	toExtractedAttachment,
} from "@carlnotes/pipeline/attachExtraction"
import { toDataUrl } from "@carlnotes/server/dataUrl"
import { ApplicationFailure } from "@temporalio/activity"
import { eq } from "drizzle-orm"

// how long one attempt may take to read and extract a file, waiting for a child process included. it is under the
// five minutes the workflow gives each attempt, so a child process never outlives its attempt
const EXTRACTION_TIME_LIMIT_MS = 270_000

/**
 * Extracts the stored file's text, and returns the text as written or as chunks to summarize. A file's text is
 * extracted in a child process under a memory limit, in turn with the other Topics' files, so a file whose read takes
 * too much memory fails its own attempt and nothing else.
 */
export async function extractAttachmentText(attachmentId: string): Promise<ExtractedAttachment> {
	// load the row for its object key and content type, then read the stored bytes
	const deadline = performance.now() + EXTRACTION_TIME_LIMIT_MS
	const [attachment] = await db.select().from(attachments).where(eq(attachments.id, attachmentId))
	if (!attachment) {
		throw ApplicationFailure.nonRetryable(`attachment ${attachmentId} not found`, "AttachmentNotFound")
	}
	const { topicId, filename, contentType } = attachment
	const bytes = await getAttachmentBytes(attachment.objectKey)

	try {
		// an image has no text to extract, so the model describes it
		if (isImageAttachmentType(contentType)) {
			const litellmApiKey = await loadOrProvisionTopicOwnerLiteLLMKey(topicId)
			return toExtractedAttachment(await generateImageContext(toDataUrl(contentType, bytes), litellmApiKey))
		}

		// a table file's rows are written as table text and a short document is stored as written, with no model call,
		// and a longer document is chunked to summarize
		return await extractTopicAttachment({ contentType, filename, bytes, turnKey: topicId, deadline })
	} catch (error) {
		// a file that is the problem itself, like one with no readable text or a zip that declares too large an
		// unpacked size, fails at once and is never tried again
		if (error instanceof AttachmentValidationError) {
			throw ApplicationFailure.nonRetryable(error.message, "AttachmentRejected")
		}

		// a read that ran past its time or its memory limit would run past it again, so it is not tried again. a file
		// that only waited for a child process until its deadline is
		if (error instanceof AttachmentExtractionLimitError && error.limit !== "wait") {
			throw ApplicationFailure.nonRetryable(error.message, "AttachmentTooLarge")
		}
		throw error
	}
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

// attachment processing activities: the I/O steps the workflow calls. they run in the worker process, not the sandbox
import { ApplicationFailure } from "@temporalio/activity"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { attachments, topics, users } from "../../db/schema"
import { extractText, generateContext, generateImageContext, isImageAttachmentType, toDataUrl } from "../attach"
import { CHUNK_CHARS, chunk, MAX_CHUNKS } from "../chunk"
import { screenText, toFlaggedReason } from "../guard"
import { deleteAttachment, getAttachmentBytes } from "../store"

// the most characters the workflow can process, so that chunk payloads stay well under Temporal's per-message limit
const MAX_PROCESS_CHARS = MAX_CHUNKS * CHUNK_CHARS
// the most characters of merged context stored, bounding a scan's token cost. the environment can override it
const MAX_CONTEXT_CHARS = Number(Bun.env.MAX_ATTACHMENT_CONTEXT_CHARS ?? "8000")

// the extracted attachment chunks and total size with an optional flagged reason
export type ExtractedAttachment = { chunks: string[]; charCount: number; flaggedReason: string | null }

// extract the stored file's text, screen it, and split it into bounded chunks for parallel summarization
export async function extractAttachmentText(attachmentId: string): Promise<ExtractedAttachment> {
	// load the row for its object key and content type, then read and extract the stored bytes
	const [attachment] = await db.select().from(attachments).where(eq(attachments.id, attachmentId))
	if (!attachment) {
		throw ApplicationFailure.nonRetryable(`attachment ${attachmentId} not found`, "AttachmentNotFound")
	}
	const bytes = await getAttachmentBytes(attachment.objectKey)

	// an image has no text to extract
	const extractedText = isImageAttachmentType(attachment.contentType)
		? await generateImageContext(toDataUrl(attachment.contentType, bytes), await topicOwnerModelKey(attachmentId))
		: await extractText(attachment.contentType, bytes)

	// screen the document with llm-guard before any model reads it and skip it if it's flagged
	const screenVerdict = await screenText(extractedText.slice(0, MAX_PROCESS_CHARS), "document")
	if (screenVerdict.isFlagged) {
		return { chunks: [], charCount: extractedText.length, flaggedReason: toFlaggedReason(screenVerdict) }
	}

	// chunk the screened text, not the original, so any personal details it redacted never reach a model
	const chunks = chunk(screenVerdict.text, MAX_CHUNKS, CHUNK_CHARS)
	return { chunks, charCount: extractedText.length, flaggedReason: null }
}

// summarize one chunk into a context note with the cheap model, billed to the topic owner's key
export async function summarizeChunk(attachmentId: string, chunkText: string): Promise<string> {
	return generateContext(chunkText, await topicOwnerModelKey(attachmentId))
}

// the LiteLLM key of the owner of the attachment's topic, or undefined when they have none and the master key bills it
async function topicOwnerModelKey(attachmentId: string): Promise<string | undefined> {
	// select the attachment's topic owner and return their LiteLLM key
	const [owner] = await db
		.select({ litellmVirtualKey: users.litellmVirtualKey })
		.from(attachments)
		.innerJoin(topics, eq(attachments.topicId, topics.id))
		.innerJoin(users, eq(topics.ownerId, users.id))
		.where(eq(attachments.id, attachmentId))
	return owner?.litellmVirtualKey ?? undefined
}

// merge the chunk summaries into one limited context, mark the attachment ready, and record its counts
export async function finalizeAttachment(
	attachmentId: string,
	summaries: string[],
	charCount: number,
	chunkCount: number,
): Promise<void> {
	// join the per-chunk notes and limit the merged context, then flip the attachment to ready
	const context = summaries.join("\n\n").slice(0, MAX_CONTEXT_CHARS)
	await db
		.update(attachments)
		.set({ status: "ready", context, error: null, charCount, chunkCount })
		.where(eq(attachments.id, attachmentId))
}

// mark an attachment failed with the reason and best-effort delete its stored object
export async function failAttachment(attachmentId: string, message: string): Promise<void> {
	// record the failure, then best-effort remove the object so a failed attachment leaves no orphan
	const [attachment] = await db
		.select({ objectKey: attachments.objectKey })
		.from(attachments)
		.where(eq(attachments.id, attachmentId))
	await db.update(attachments).set({ status: "failed", error: message }).where(eq(attachments.id, attachmentId))

	// the row is already marked failed, so a missing object or a failed delete leaves nothing inconsistent
	if (attachment) {
		await deleteAttachment(attachment.objectKey).catch(() => {})
	}
}

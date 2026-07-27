// attachment processing activities: the I/O steps the workflow orchestrates. they run in the worker process, not the sandbox
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { attachments } from "../../db/schema"
import { extractText, generateContext } from "../attach"
import { CHUNK_CHARS, chunk, MAX_CHUNKS } from "../chunk"
import { deleteAttachment, getAttachmentBytes } from "../store"

// the most characters the workflow can process, so that chunk payloads stay well under Temporal's per-message limit
const MAX_PROCESS_CHARS = MAX_CHUNKS * CHUNK_CHARS
// the most characters of merged context stored, bounding a scan's token cost. the environment can override it
const MAX_CONTEXT_CHARS = Number(Bun.env.MAX_ATTACHMENT_CONTEXT_CHARS ?? "8000")

// extract the stored file's text and split it into bounded chunks for parallel summarization
export async function extractAttachmentText(attachmentId: string): Promise<{ chunks: string[]; charCount: number }> {
	// load the row for its object key and content type, then read and extract the stored bytes
	const [attachment] = await db.select().from(attachments).where(eq(attachments.id, attachmentId))
	if (!attachment) {
		throw new Error(`attachment ${attachmentId} not found`)
	}
	const bytes = await getAttachmentBytes(attachment.objectKey)
	const text = await extractText(attachment.contentType, bytes)

	// cap the processed text so that chunk payloads stay bounded. charCount is the full uncapped length
	return { chunks: chunk(text.slice(0, MAX_PROCESS_CHARS), MAX_CHUNKS, CHUNK_CHARS), charCount: text.length }
}

// summarize one chunk into a context note with the cheap model
export async function summarizeChunk(chunkText: string): Promise<string> {
	return generateContext(chunkText)
}

// merge the chunk summaries into one capped context, mark the attachment ready, and record its counts
export async function finalizeAttachment(
	attachmentId: string,
	summaries: string[],
	charCount: number,
	chunkCount: number,
): Promise<void> {
	// join the per-chunk notes and cap the merged context, then flip the attachment to ready
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
	if (attachment) {
		await deleteAttachment(attachment.objectKey).catch(() => {})
	}
}

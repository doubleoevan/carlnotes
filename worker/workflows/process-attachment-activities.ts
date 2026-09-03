// attachment processing activities: the I/O steps the workflow calls. they run in the worker process, not the sandbox
import { ApplicationFailure } from "@temporalio/activity"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { attachments, topics, users } from "../../db/schema"
import {
	extractText,
	generateAttachmentContext,
	generateImageContext,
	isImageAttachmentType,
	isTableFileType,
	toClippedTableText,
	toDataUrl,
	toTableText,
} from "../attach"
import { CHUNK_CHARS, chunk, MAX_CHUNKS } from "../chunk"
import { screenText, toFlaggedReason } from "../guard"
import { deleteAttachment, getAttachmentBytes } from "../store"

// the most characters the workflow can process, so that chunk payloads stay well under Temporal's per-message limit
const MAX_PROCESS_CHARS = MAX_CHUNKS * CHUNK_CHARS
// the most characters of merged context stored, bounding a scan's token cost. the environment can override it
const MAX_CONTEXT_CHARS = Number(Bun.env.MAX_ATTACHMENT_CONTEXT_CHARS ?? "8000")
// how long a table file's screen may run, longer than prose since its rows reach the prompt verbatim
const TABLE_SCREEN_TIMEOUT_MS = Number(Bun.env.LLM_GUARD_TABLE_TIMEOUT_MS ?? "10000")

// the extracted attachment chunks and total size, with a flagged reason or ready table text
export type ExtractedAttachment = {
	chunks: string[]
	charCount: number
	flaggedReason: string | null
	tableContext: string | null
}

/** Extracts the stored file's text, screens it, and either writes its rows as table text or chunks it for summarization. */
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

	// fail a file with no readable text, like a scanned PDF or a chart-only workbook
	if (!extractedText.trim()) {
		throw ApplicationFailure.nonRetryable("the file held no readable text", "NoReadableText")
	}

	// a table file is screened over only the rows its table text can keep. the rest can never reach a
	// scan, so screening it spends the scanner on text nobody will read
	const isTableFile = isTableFileType(attachment.contentType)
	const clippedTableText = isTableFile ? toClippedTableText(extractedText) : null
	const screenableText = (clippedTableText?.serializedText ?? extractedText).slice(0, MAX_PROCESS_CHARS)

	// screen the document with llm-guard before any model reads it and skip it if it's flagged
	const screenVerdict = await screenText(screenableText, "document", {
		timeoutMs: isTableFile ? TABLE_SCREEN_TIMEOUT_MS : undefined,
	})
	if (screenVerdict.isFlagged) {
		return {
			chunks: [],
			charCount: extractedText.length,
			flaggedReason: toFlaggedReason(screenVerdict),
			tableContext: null,
		}
	}

	// a configured scanner that did not answer fails table text instead of failing open. the throw lets the activity retry first
	if (isTableFile && screenVerdict.outcome === "failed") {
		throw new Error("this file's contents could not be checked by the scanner")
	}

	// a table file's rows are written from the screened text, with no model call at all
	if (isTableFile) {
		const tableContext = toTableText({
			serializedText: screenVerdict.text,
			filename: attachment.filename,
			contentType: attachment.contentType,
			skippedRows: clippedTableText?.skippedRows ?? 0,
		})
		return { chunks: [], charCount: extractedText.length, flaggedReason: null, tableContext }
	}

	// mark the cut on a document past the processing limit
	const markedText =
		extractedText.length > MAX_PROCESS_CHARS
			? `${screenVerdict.text}${toCutMarker(extractedText.length)}`
			: screenVerdict.text

	// chunk the screened text, not the original, so any personal details it redacted never reach a model
	const chunks = chunk(markedText, MAX_CHUNKS, CHUNK_CHARS)
	return { chunks, charCount: extractedText.length, flaggedReason: null, tableContext: null }
}

// the line appended where a long document was cut
function toCutMarker(fullLength: number): string {
	const keptChars = MAX_PROCESS_CHARS.toLocaleString("en-US")
	return `\n\n[The document is cut here. It runs ${fullLength.toLocaleString("en-US")} characters and only the first ${keptChars} are included.]`
}

// summarize one chunk into a context note with the cheap model, billed to the topic owner's key
export async function summarizeChunk(attachmentId: string, chunkText: string): Promise<string> {
	return generateAttachmentContext(chunkText, await topicOwnerModelKey(attachmentId))
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
	await markAttachmentReady(attachmentId, context, charCount, chunkCount)
}

/** Stores table text as computed. The merged-context slice would cut table text mid-row. */
export async function finalizeTableAttachment(
	attachmentId: string,
	tableContext: string,
	charCount: number,
): Promise<void> {
	await markAttachmentReady(attachmentId, tableContext, charCount, 0)
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

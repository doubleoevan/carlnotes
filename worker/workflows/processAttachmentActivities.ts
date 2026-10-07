// attachment processing activities: the I/O steps the workflow calls. they run in the worker process, not the sandbox
import { ATTACHMENT_NO_TEXT_REASON, MAX_ATTACHMENT_CONTEXT_CHARS } from "@shared/contracts"
import { ApplicationFailure } from "@temporalio/activity"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { attachments, topics } from "../../db/schema"
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
import { loadOrProvisionUserLiteLLMKey } from "../litellm"
import { deleteAttachment, getAttachmentBytes } from "../store"

// the most characters the workflow can process, so that chunk payloads stay well under Temporal's per-message limit
const MAX_PROCESS_CHARS = MAX_CHUNKS * CHUNK_CHARS
// how long the screen of text stored as written may run, long enough for a busy scanner to finish.
// a summarized document gets the scanner's default
const VERBATIM_SCREEN_TIMEOUT_MS = 60_000

// the extracted attachment chunks and total size, with a flagged reason or the context stored as written
export type ExtractedAttachment = {
	chunks: string[]
	charCount: number
	flaggedReason: string | null
	verbatimContext: string | null
}

/** Extracts and screens the stored file's text, and returns the text as written or as chunks to summarize. */
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
		throw ApplicationFailure.nonRetryable(ATTACHMENT_NO_TEXT_REASON, "NoReadableText")
	}

	// a table file is screened over only the rows its table text can keep. the rest can never reach a
	// scan, so screening it spends the scanner on text nobody will read
	const isTableFile = isTableFileType(attachment.contentType)
	const clippedTableText = isTableFile ? toClippedTableText(extractedText) : null
	const screenableText = (clippedTableText?.serializedText ?? extractedText).slice(0, MAX_PROCESS_CHARS)

	// a table file and a short document are stored as written, with no model call in between
	const isVerbatimAttachment = isTableFile || extractedText.length <= MAX_ATTACHMENT_CONTEXT_CHARS

	// screen the text before any model reads the text, and stop at a flag. a page attached by url gets the whole check,
	// and an owner's upload gets the upload check. a screen that never finishes passes the text
	const screenVerdict = await screenText(screenableText, attachment.sourceUrl ? "document" : "upload", {
		timeoutMs: isVerbatimAttachment ? VERBATIM_SCREEN_TIMEOUT_MS : undefined,
	})
	if (screenVerdict.isFlagged) {
		return {
			chunks: [],
			charCount: extractedText.length,
			flaggedReason: toFlaggedReason(screenVerdict),
			verbatimContext: null,
		}
	}

	// a table file's rows are written from the screened text
	if (isTableFile) {
		const tableContext = toTableText({
			serializedText: screenVerdict.text,
			filename: attachment.filename,
			contentType: attachment.contentType,
			skippedRows: clippedTableText?.skippedRows ?? 0,
		})
		return { chunks: [], charCount: extractedText.length, flaggedReason: null, verbatimContext: tableContext }
	}

	// a short document is its own context. redaction can lengthen the text, so the text is limited again
	if (isVerbatimAttachment) {
		const verbatimContext = screenVerdict.text.slice(0, MAX_ATTACHMENT_CONTEXT_CHARS)
		return { chunks: [], charCount: extractedText.length, flaggedReason: null, verbatimContext }
	}

	// mark the cut on a document past the processing limit
	const markedText =
		extractedText.length > MAX_PROCESS_CHARS
			? `${screenVerdict.text}${toCutMarker(extractedText.length)}`
			: screenVerdict.text

	// chunk the screened text, not the original, so any personal details it redacted never reach a model
	const chunks = chunk(markedText, MAX_CHUNKS, CHUNK_CHARS)
	return { chunks, charCount: extractedText.length, flaggedReason: null, verbatimContext: null }
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

// the LiteLLM key of the owner of the attachment's topic, created first if the owner has none
async function topicOwnerModelKey(attachmentId: string): Promise<string> {
	// select the attachment's topic owner
	const [attachmentTopic] = await db
		.select({ ownerId: topics.ownerId })
		.from(attachments)
		.innerJoin(topics, eq(attachments.topicId, topics.id))
		.where(eq(attachments.id, attachmentId))

	// fail an attachment that is gone, then return the topic owner's key
	if (!attachmentTopic) {
		throw ApplicationFailure.nonRetryable(`attachment ${attachmentId} not found`, "AttachmentNotFound")
	}
	return loadOrProvisionUserLiteLLMKey(attachmentTopic.ownerId)
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
		await deleteAttachment(attachment.objectKey)
	}
}

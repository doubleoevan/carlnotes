// topic attachments: store a file in object storage, generate its context once at upload, and expose the context scans read
import { generateText } from "ai"
import { eq } from "drizzle-orm"
import { extractText as extractPdfText } from "unpdf"
import { db } from "../db"
import { attachments, topics } from "../db/schema"
import { cheapModel } from "./llm"
import { attachmentKey, deleteAttachment, putAttachment } from "./storage"

// a persisted attachment row, and the upload ingestAttachment accepts
type Attachment = typeof attachments.$inferSelect
type AttachmentUpload = { topicId: string; filename: string; contentType: string; bytes: Uint8Array }

// reject uploads larger than this before any storage/LLM work, bounding storage and inference spend at the trust boundary
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
// cap the extracted text fed to the model, mirroring the search adapter's context cap
const MAX_EXTRACT_CHARS = 8000

// store the file, generate its context once, and persist the attachment; validation runs first so a bad upload does no work
export async function ingestAttachment(upload: AttachmentUpload): Promise<Attachment> {
	const { topicId, filename, contentType, bytes } = upload
	// validate size at the trust boundary before touching storage or the model
	if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
		throw new Error(`attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`)
	}
	// reject a nonexistent topic before spending storage or inference (the FK would only catch it at insert, after the upload)
	const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`topic ${topicId} not found`)
	}
	// extract first (local, no network) so an unsupported type is rejected before anything is stored
	const text = await extractText(contentType, bytes)
	// store the raw bytes under a topic/attachment key; the id is generated up front to embed in the key
	const id = crypto.randomUUID()
	const byteSize = bytes.byteLength
	const objectKey = attachmentKey(topicId, id, filename)
	await putAttachment(objectKey, bytes, contentType)
	// from here the object exists, so any failure must delete it to avoid an orphan
	try {
		const context = await generateContext(text)
		const values = { id, topicId, objectKey, filename, contentType, byteSize, context }
		const [attachment] = await db.insert(attachments).values(values).returning()
		// surface an empty insert result instead of returning undefined
		if (!attachment) {
			throw new Error(`failed to persist attachment for topic ${topicId}`)
		}
		return attachment
	} catch (error) {
		// best-effort delete of the stored object, then rethrow the original failure
		await deleteAttachment(objectKey).catch(() => {})
		throw error
	}
}

// extract text from an uploaded file by content type: text/markdown decoded directly, PDF via unpdf, anything else rejected
export async function extractText(contentType: string, bytes: Uint8Array): Promise<string> {
	// text and markdown are already text — decode straight to a string
	if (contentType.startsWith("text/")) {
		return new TextDecoder().decode(bytes)
	}
	// PDF: parse with unpdf, merging every page into one string
	if (contentType === "application/pdf") {
		const { text } = await extractPdfText(bytes, { mergePages: true })
		return text
	}
	// any other type has no extractor — reject so the caller stores nothing
	throw new Error(`unsupported attachment content type: ${contentType}`)
}

// build the context-generation prompt over the file's text, capped so a huge document can't blow the token budget
export function buildContextPrompt(text: string): string {
	// cap length to bound tokens/spend, mirroring the search adapter's context cap
	const capped = text.slice(0, MAX_EXTRACT_CHARS)
	return `Extract concise notes capturing what the document below is about — its subject, key facts, and themes — as context for curating related media. Return only the notes.\n\nDocument:\n${capped}`
}

// generate a context string from the file's text with the cheap-tier model through LiteLLM (one call, no tools)
async function generateContext(text: string): Promise<string> {
	// a single generateText — text in, plain-text context out; no schema, the output is just context
	const { text: context } = await generateText({ model: cheapModel(), prompt: buildContextPrompt(text) })
	return context.trim()
}

// a topic's effective scan context: its own context merged with its attachments' contexts — what a scan reads
export async function topicScanContext(topicId: string): Promise<{ name: string; context: string }> {
	// read the topic's name and context; the topic must exist (its Sources reference it)
	const [topic] = await db
		.select({ name: topics.name, context: topics.context })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`topic ${topicId} not found`)
	}
	// read every attachment's context for the topic
	const attachmentContexts = await db
		.select({ context: attachments.context })
		.from(attachments)
		.where(eq(attachments.topicId, topicId))
	// merge the topic context and attachment contexts, dropping empties, into one context string
	const context = [topic.context, ...attachmentContexts.map((row) => row.context)]
		.map((part) => part.trim())
		.filter(Boolean)
		.join("\n\n")
	return { name: topic.name, context }
}

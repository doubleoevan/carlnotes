import { db } from "@carlnotes/db"
import { attachments, topics } from "@carlnotes/db/schema/topics"
import {
	clearPendingObjectDeletion,
	deleteStoredObject,
	MAX_KEY_FILENAME_CHARS,
	recordPendingObjectDeletionBeforeUpload,
	recordPendingObjectDeletions,
	toAttachmentKey,
	uploadAttachment,
} from "@carlnotes/db/store"
import { chatModel, cheapModel } from "@carlnotes/models/models"
// the prompt loader fetches the registry version first, falling back to the bundled markdown
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { isHostRejection, toFetchableUrl } from "@carlnotes/server/publicFetch"
import { generateText } from "ai"
import { and, eq } from "drizzle-orm"
import { AttachmentValidationError, isSupportedAttachmentType } from "./attachContentType"
import { fetchContent } from "./scrape"
import { startAttachmentWorkflow } from "./temporalClient"

// a persisted attachment row, and the upload ingestAttachment input
type Attachment = typeof attachments.$inferSelect
type AttachmentUpload = {
	topicId: string
	filename: string
	contentType: string
	bytes: Uint8Array
	sourceUrl?: string
}

// reject uploads larger than this before any storage or model work
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
// limit the extracted text fed to the model
const MAX_EXTRACT_CHARS = 8000
// a fetched page is stored as markdown
const PAGE_EXTENSION = ".md"
const MAX_PAGE_NAME_CHARS = MAX_KEY_FILENAME_CHARS - PAGE_EXTENSION.length

// the synchronous half of ingestion
export async function ingestAttachment(attachmentUpload: AttachmentUpload): Promise<Attachment> {
	const { topicId, filename, contentType, bytes, sourceUrl = null } = attachmentUpload
	// validate the size and type of the payload before touching storage
	if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
		throw new AttachmentValidationError(`attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`)
	}
	// an empty upload would store fine and read back as a ready attachment that downloads to nothing, so prevent it here
	if (bytes.byteLength === 0) {
		throw new AttachmentValidationError("attachment is empty")
	}
	if (!isSupportedAttachmentType(contentType)) {
		throw new AttachmentValidationError(`unsupported attachment content type: ${contentType}`)
	}

	// reject a nonexistent topic before spending storage. the foreign key would only catch it at insert
	await isExistingTopic(topicId)

	// record the key as pending with the upload grace period, then store the raw bytes under a key that is namespaced
	// by topic and attachment
	const attachmentId = crypto.randomUUID()
	const objectKey = toAttachmentKey(topicId, attachmentId, filename)
	await recordPendingObjectDeletionBeforeUpload(objectKey)
	await uploadAttachment(objectKey, bytes, contentType)

	// from here the object exists
	try {
		const attachmentRow = {
			id: attachmentId,
			topicId,
			objectKey,
			filename,
			contentType,
			byteSize: bytes.byteLength,
			sourceUrl,
		}

		// insert the row and clear the key's pending deletion in one transaction
		const attachment = await db.transaction(async (transaction) => {
			const [insertedAttachment] = await transaction.insert(attachments).values(attachmentRow).returning()
			await clearPendingObjectDeletion(objectKey, transaction)
			return insertedAttachment
		})
		if (!attachment) {
			throw new Error(`failed to persist attachment for topic ${topicId}`)
		}

		// start the durable workflow that extracts, summarizes, and marks the attachment ready
		await startAttachmentWorkflow(attachmentId)
		return attachment
	} catch (error) {
		// delete the attachment row, record the key again, and delete the object, then rethrow the original failure
		await db
			.delete(attachments)
			.where(eq(attachments.id, attachmentId))
			.catch(() => {})

		// record the key again and delete the object
		await recordPendingObjectDeletions({ handle: db, objectKeys: [objectKey] }).catch(() => {})
		await deleteStoredObject(objectKey)
		throw error
	}
}

/**
 * Ingest a URL as an attachment. The page is fetched here, then handed to the same synchronous half a file upload uses,
 * so storage, persistence, and orphan cleanup are the shared path. A url that cannot be fetched is rejected instead of stored
 */
export async function ingestUrlAttachment(topicId: string, url: string): Promise<Attachment> {
	// reject a malformed, non-http, or internal url before any request goes out. each rejection names its own reason
	let fetchableUrl: URL
	try {
		fetchableUrl = toFetchableUrl(url)
	} catch (error) {
		throw new AttachmentValidationError(error instanceof Error ? error.message : String(error))
	}

	// an attached url names a page to read, so it takes the scrape instead of the caption path a video would.
	// a page its host refuses is the user's to fix, and any other fetch failure is an infrastructure fault that is rethrown
	const fetchResult = await fetchContent(fetchableUrl.toString(), "read").catch((error: unknown) => {
		if (isHostRejection(error)) {
			throw new AttachmentValidationError(`this page could not be read: ${url}`)
		}
		throw error
	})

	// the processing workflow screens this Markdown as a document, so there is no llm-guard screen here
	return ingestAttachment({
		topicId,
		filename: toPageFilename(fetchableUrl),
		contentType: "text/markdown",
		bytes: new TextEncoder().encode(fetchResult.text),
		sourceUrl: fetchableUrl.toString(),
	})
}

/**
 * A filename for a fetched page, built from its host and path so the stored object reads as its origin.
 */
function toPageFilename(pageUrl: URL): string {
	// a fetched page has no filename the way an upload does, so use the url
	const filePath = pageUrl.pathname.replaceAll("/", "-").replace(/^-+|-+$/g, "")
	const pageName = `${pageUrl.hostname}${filePath ? `-${filePath}` : ""}`
	return `${pageName.slice(0, MAX_PAGE_NAME_CHARS)}${PAGE_EXTENSION}`
}

// throw an error if the topic doesn't exist
async function isExistingTopic(topicId: string): Promise<void> {
	// the foreign key would only catch a bad topic at insert, after the work is done. check up front instead
	const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`topic ${topicId} not found`)
	}
}

/**
 * Stored image bytes as the data url for the model to read.
 */
export function toDataUrl(contentType: string, bytes: Uint8Array): string {
	return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`
}

// build the context-generation prompt over attach-context.md, limited so a huge document can't blow the token budget
export async function buildContextPrompt(text: string): Promise<BuiltPrompt> {
	// fetch the registry version first, then limit the document length to bound the token spend
	const { template, name, registryPrompt } = await fetchPromptTemplate("attach-context")

	// a clipped document marks its cut
	const clippedText =
		text.length > MAX_EXTRACT_CHARS
			? `${text.slice(0, MAX_EXTRACT_CHARS)}\n\n[The document is cut here. It runs ${text.length.toLocaleString("en-US")} characters and only the first ${MAX_EXTRACT_CHARS.toLocaleString("en-US")} are included.]`
			: text
	const prompt = writePrompt(template, { document: clippedText })
	return { prompt, name, registryPrompt }
}

// generate a context string from any attachment's text with the cheap model, billed to the given key
export async function generateAttachmentContext(text: string, litellmApiKey?: string): Promise<string> {
	// fetch and write the prompt
	const contextPrompt = await buildContextPrompt(text)

	// link the registry version to the trace when one served the prompt
	const { text: context } = await generateText({
		model: cheapModel(litellmApiKey),
		prompt: contextPrompt.prompt,
		...promptTelemetry(contextPrompt),
	})
	return context.trim()
}

// describe an attached image with the chat model, billed to the user's own key
export async function generateImageContext(dataUrl: string, litellmApiKey?: string): Promise<string> {
	// fetch and write the prompt. it takes no variables, and the image includes everything the model reads
	const { template, name, registryPrompt } = await fetchPromptTemplate("attach-image-context")
	const prompt = writePrompt(template, {})

	// send the prompt and the image as one user message, linking the registry version to the trace
	const { text } = await generateText({
		model: chatModel(litellmApiKey),
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: prompt },
					{ type: "image", image: dataUrl },
				],
			},
		],
		...promptTelemetry({ prompt, name, registryPrompt }),
	})
	return text.trim()
}

// the context a scan reads for a topic. the topic's prompt merged with every attachment's context
export async function buildTopicScanContext(topicId: string): Promise<{ name: string; context: string }> {
	// read the topic's name and prompt. throw an error if the topic does not exist
	const [topic] = await db
		.select({ name: topics.name, prompt: topics.prompt })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`topic ${topicId} not found`)
	}

	// read every ready attachment's context for the topic. a pending or failed attachment has no settled context to read
	const attachmentContexts = await db
		.select({ filename: attachments.filename, context: attachments.context })
		.from(attachments)
		.where(and(eq(attachments.topicId, topicId), eq(attachments.status, "ready")))
		.orderBy(attachments.filename, attachments.id)

	// label each attachment context with its file
	const labeledAttachmentContexts = attachmentContexts
		.filter((contextRow) => (contextRow.context ?? "").trim())
		.map((contextRow) => `[attachment: ${contextRow.filename}]\n${(contextRow.context ?? "").trim()}`)
	const context = [topic.prompt.trim(), ...labeledAttachmentContexts].filter(Boolean).join("\n\n")
	return { name: topic.name, context }
}

/**
 * Hashes the context text that a Scan reviews against, which the Finding records as its hash.
 */
export function toTopicContextHash(contextText: string): string {
	return new Bun.CryptoHasher("sha256").update(contextText.trim()).digest("hex")
}

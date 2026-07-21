// topic attachments. a file is stored in object storage, its context is generated once at upload, and scans read it into the context
import { generateText } from "ai"
import { eq } from "drizzle-orm"
import { extractText as extractPdfText } from "unpdf"
import { db } from "../db"
import { attachments, topics } from "../db/schema"
import { cheapModel } from "./models.ts"
import { fetchContent } from "./scrape.ts"
import { attachmentKey, deleteAttachment, putAttachment } from "./storage"

// a persisted attachment row, and the upload ingestAttachment input
type Attachment = typeof attachments.$inferSelect
type AttachmentUpload = {
	topicId: string
	filename: string
	contentType: string
	bytes: Uint8Array
	sourceUrl?: string
}

// reject uploads larger than this before any storage or model work. this bounds storage and inference cost at the trust boundary
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
// cap the extracted text fed to the model
const MAX_EXTRACT_CHARS = 8000

// store the file, generate its context once, and persist the attachment. validation runs first, so a bad upload does no work
export async function ingestAttachment(upload: AttachmentUpload): Promise<Attachment> {
	const { topicId, filename, contentType, bytes, sourceUrl = null } = upload
	// validate the size before touching storage or the model
	if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
		throw new Error(`attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`)
	}

	// reject a nonexistent topic before spending storage or inference
	// the foreign key would only catch it at insert, after the upload
	await requireTopic(topicId)

	// first extract so an unsupported type is rejected before anything is stored
	const text = await extractText(contentType, bytes)
	// store the raw bytes under a key namespaced by topic and attachment
	const id = crypto.randomUUID()
	const byteSize = bytes.byteLength
	const objectKey = attachmentKey(topicId, id, filename)
	await putAttachment(objectKey, bytes, contentType)

	// from here the object exists, so any failure must delete it to avoid an orphan
	try {
		const context = await generateContext(text)
		const row = { id, topicId, objectKey, filename, contentType, byteSize, context, sourceUrl }
		const [attachment] = await db.insert(attachments).values(row).returning()
		// surface an empty insert result instead of returning undefined
		if (!attachment) {
			throw new Error(`failed to persist attachment for topic ${topicId}`)
		}
		return attachment
	} catch (error) {
		// delete of the stored object best-effort, then rethrow the original failure
		await deleteAttachment(objectKey).catch(() => {})
		throw error
	}
}

// ingest an attachment from a URL by fetching the page as Markdown via Firecrawl and running the shared file-ingestion path. the fetcher parameter lets the smoke test stub the network call
export async function ingestUrlAttachment(topicId: string, url: string, fetcher = fetchContent): Promise<Attachment> {
	// reject a malformed URL before any fetch
	let pageUrl: URL
	try {
		pageUrl = new URL(url)
	} catch {
		throw new Error(`invalid attachment URL: ${url}`)
	}

	// only http and https are fetchable. reject file, data, and any other scheme
	if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") {
		throw new Error(`attachment URL must be http(s): ${url}`)
	}

	// reject a nonexistent topic before the paid fetch
	await requireTopic(topicId)

	// fetch the page to Markdown. empty content means nothing usable, so reject instead of storing a contextless attachment
	const markdown = await fetcher(url)
	if (!markdown.trim()) {
		throw new Error(`attachment URL fetched no content: ${url}`)
	}

	// build a readable filename from the page host. attachmentKey sanitizes it again before it lands in the object key
	const filename = `${pageUrl.hostname.replace(/[^a-z0-9.]+/gi, "-")}.md`

	// wrap the Markdown as a text/markdown upload and run the shared file-ingestion path, recording the origin URL
	const bytes = new TextEncoder().encode(markdown)
	return ingestAttachment({ topicId, filename, contentType: "text/markdown", bytes, sourceUrl: url })
}

// throw if the topic doesn't exist, so both ingestion paths reject a misaddressed upload before spending storage, inference, or a fetch
async function requireTopic(topicId: string): Promise<void> {
	// the foreign key would only catch a bad topic at insert, after the work is done. check up front instead
	const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`topic ${topicId} not found`)
	}
}

// extract text from an uploaded file. text types decode directly, PDF parses via unpdf, and anything else is rejected
export async function extractText(contentType: string, bytes: Uint8Array): Promise<string> {
	// any text type is already text, so decode straight to a string
	if (contentType.startsWith("text/")) {
		return new TextDecoder().decode(bytes)
	}

	// parse a PDF with unpdf, merging every page into one string
	if (contentType === "application/pdf") {
		const { text } = await extractPdfText(bytes, { mergePages: true })
		return text
	}

	// any other type has no extractor. reject so the caller stores nothing
	throw new Error(`unsupported attachment content type: ${contentType}`)
}

// build the context-generation prompt over the file's text, capped so a huge document can't blow the token budget
export function buildContextPrompt(text: string): string {
	// cap the document length to bound the token spend
	const document = text.slice(0, MAX_EXTRACT_CHARS)
	return `Extract concise notes capturing what the document below is about — its subject, key facts, and themes — as context for curating related media. Return only the notes.\n\nDocument:\n${document}`
}

// generate a context string from the file's text with the cheap-tier model through LiteLLM. one call, no tools
async function generateContext(text: string): Promise<string> {
	// a single generateText call with no schema. text goes in and a plain-text context comes out
	const { text: context } = await generateText({ model: cheapModel(), prompt: buildContextPrompt(text) })
	return context.trim()
}

// the context a scan reads for a topic. the topic's prompt merged with every attachment's context
export async function buildTopicScanContext(topicId: string): Promise<{ name: string; context: string }> {
	// read the topic's name and prompt. throw if the topic does not exist
	const [topic] = await db
		.select({ name: topics.name, prompt: topics.prompt })
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

	// merge the topic prompt and attachment contexts, dropping empties, into one context string
	const context = [topic.prompt, ...attachmentContexts.map((row) => row.context)]
		.map((part) => part.trim())
		.filter(Boolean)
		.join("\n\n")
	return { name: topic.name, context }
}

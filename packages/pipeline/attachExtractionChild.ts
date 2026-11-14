// the child process that extracts one attached file. it takes one request from the process that started it, reads the
// file under a memory watchdog, and replies with what a chat or a Topic keeps of the file's text
import { toBaseContentType, XLSX_TYPE } from "@carlnotes/contracts/attachmentTypes"
import { CHAT_ATTACHMENT_TEXT_CHARS, clipAttachmentText } from "@carlnotes/contracts/chat"
import { AttachmentValidationError, isTableFileType } from "./attachContentType"
import {
	type AttachmentExtractionReply,
	type AttachmentExtractionRequest,
	type ExtractedAttachment,
	toExtractedAttachment,
	toNoTextError,
} from "./attachExtraction"
import { toTableText, toWorkbookTableText } from "./attachTable"
import { extractText, extractTextUpTo } from "./attachText"

// how far resident memory may grow past the last collection before what the read let go of is collected, and how
// often its growth is read, in milliseconds
const COLLECTION_STEP_BYTES = 32 * 1024 * 1024
const COLLECTION_CHECK_INTERVAL_MS = 50

// extract the one file this process is sent, and reply
process.on("message", async (request: AttachmentExtractionRequest) => {
	sendReply(await toExtractionReply(request))
})

// a process whose starter is gone has nobody to reply to
process.on("disconnect", () => process.exit(0))

// tell the process that started this one that its request can be sent
sendReply({ status: "ready" })

// send one reply to the process that started this one
function sendReply(reply: AttachmentExtractionReply): void {
	process.send?.(reply)
}

// start the thread that ends this process once its resident memory passes the limit, and return once the thread has
// read the memory for the first time. a thread that fails to start rejects, so no file is read unwatched
function startMemoryWatchdog(memoryLimitBytes: number): Promise<void> {
	const memoryWatchdog = new Worker(new URL("./attachExtractionWatchdog.ts", import.meta.url).href)
	return new Promise((resolve, reject) => {
		memoryWatchdog.onmessage = () => resolve()
		memoryWatchdog.onerror = (event) => reject(new Error(`the memory watchdog failed: ${event.message}`))
		memoryWatchdog.postMessage(memoryLimitBytes)
	})
}

// collect what the read let go of each time resident memory has grown a step, so the memory the watchdog reads stays
// near what the read holds
function startMemoryCollection(): void {
	// the resident memory the next collection starts at
	let collectionBytes = process.memoryUsage.rss() + COLLECTION_STEP_BYTES
	setInterval(() => {
		if (process.memoryUsage.rss() > collectionBytes) {
			Bun.gc(true)
			collectionBytes = process.memoryUsage.rss() + COLLECTION_STEP_BYTES
		}
	}, COLLECTION_CHECK_INTERVAL_MS)
}

// extract the request's file for what it is for, once the watchdog that ends this process past the request's memory
// limit is watching
async function toExtractionReply(request: AttachmentExtractionRequest): Promise<AttachmentExtractionReply> {
	try {
		await startMemoryWatchdog(request.memoryLimitBytes)
		startMemoryCollection()
		const extraction = request.purpose === "chat" ? await toChatText(request) : await toTopicExtraction(request)
		return { status: "extracted", extraction }
	} catch (error) {
		// an error crosses back as its message, as a rejection if it names the file itself and as a failed read if not
		const reason = error instanceof Error ? error.message : String(error)
		return { status: error instanceof AttachmentValidationError ? "rejected" : "failed", reason }
	}
}

// the text a chat reads from a file, read no further than the attachment text limit and clipped to it, so only the
// clipped text crosses back
async function toChatText({ contentType, bytes }: AttachmentExtractionRequest): Promise<string> {
	const { text, pdfPageCount, charCount } = await extractTextUpTo(contentType, bytes, CHAT_ATTACHMENT_TEXT_CHARS)

	// a workbook's text held in part names its whole length, which the clip's marker says
	return clipAttachmentText(text, pdfPageCount, charCount)
}

// what a Topic keeps of a file: a table file's rows as table text, a short document as written, or a longer
// document's chunks to summarize
async function toTopicExtraction({
	contentType,
	filename,
	bytes,
}: AttachmentExtractionRequest): Promise<ExtractedAttachment> {
	// a workbook's rows are written as table text as they are read, and a workbook with no row has no text
	if (toBaseContentType(contentType) === XLSX_TYPE) {
		const { tableText, charCount } = await toWorkbookTableText(bytes, filename)
		if (charCount === 0) {
			throw toNoTextError()
		}
		return { chunks: [], charCount, verbatimContext: tableText }
	}

	// any other file's text is read whole, and a document is stored as written or chunked
	const extractedText = await extractText(contentType, bytes)
	if (!isTableFileType(contentType)) {
		return toExtractedAttachment(extractedText)
	}

	// a csv's or a tsv's rows are written as table text, with no model call
	if (!extractedText.trim()) {
		throw toNoTextError()
	}
	const tableText = toTableText({ serializedText: extractedText, filename, contentType })
	return { chunks: [], charCount: extractedText.length, verbatimContext: tableText }
}

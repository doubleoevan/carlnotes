// the worker thread that extracts an attached file's text, so a large file never stalls the api's event loop
import { CHAT_ATTACHMENT_TEXT_CHARS, clipAttachmentText } from "@carlnotes/contracts/chat"
import { extractTextUpTo } from "@carlnotes/pipeline/attachText"
import type { ExtractionRequest, ExtractionResult } from "./attachmentExtraction"

// the thread's own global scope, which receives a request and posts its result
declare const self: Worker

// extract each request's text, read no further than the attachment text limit and clipped to it, and post the text or
// the error under the request's id. only the clipped text crosses back to the event loop's thread
self.onmessage = async ({ data: { requestId, contentType, bytes } }: MessageEvent<ExtractionRequest>) => {
	try {
		const { text, pdfPageCount } = await extractTextUpTo(contentType, new Uint8Array(bytes), CHAT_ATTACHMENT_TEXT_CHARS)
		self.postMessage({ requestId, text: clipAttachmentText(text, pdfPageCount) } satisfies ExtractionResult)
	} catch (error) {
		// an error crosses the thread as its message
		self.postMessage({
			requestId,
			error: error instanceof Error ? error.message : String(error),
		} satisfies ExtractionResult)
	}
}

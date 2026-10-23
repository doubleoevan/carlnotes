// the worker thread's extraction tests: a file's text, a file that cannot be read, a type with no extractor, and a
// file past its deadline, which never fails the file queued behind it
import { expect, test } from "bun:test"
import {
	AttachmentBusyError,
	AttachmentTimeLimitError,
	extractTextInWorker,
	toExtractionDeadline,
} from "./attachmentExtraction"

// a text file's bytes, read before the extraction deadline
function toTextFile(text: string): { contentType: string; bytes: Uint8Array; deadline: number } {
	return { contentType: "text/plain", bytes: new TextEncoder().encode(text), deadline: toExtractionDeadline() }
}

// an html page long enough that the worker thread takes more than a millisecond to read it. each read transfers its
// bytes, so each test encodes its own
function toLongHtmlBytes(): Uint8Array {
	return new TextEncoder().encode("<p>Carl reads every paragraph.</p>".repeat(60_000))
}

// a text file's words come back from the worker thread as extractText reads them
test("extractTextInWorker returns a file's text from the worker", async () => {
	expect(await extractTextInWorker(toTextFile("Carl reads the attachment."))).toBe("Carl reads the attachment.")
})

// a view into a larger buffer transfers only its own bytes
test("extractTextInWorker reads only a view's own bytes", async () => {
	const buffer = new TextEncoder().encode("skip-Carl-skip")
	expect(await extractTextInWorker({ ...toTextFile(""), bytes: buffer.subarray(5, 9) })).toBe("Carl")
})

// a PDF that cannot be parsed rejects, so the route can reject the chat turn
test("extractTextInWorker rejects a file that cannot be read", async () => {
	const unreadablePdf = { ...toTextFile("not a pdf"), contentType: "application/pdf" }
	await expect(extractTextInWorker(unreadablePdf)).rejects.toThrow()
})

// a type with no extractor rejects with the message extractText throws, and the worker thread keeps serving
test("extractTextInWorker rejects a type with no extractor and keeps the worker", async () => {
	const zipFile = { ...toTextFile("PK"), contentType: "application/zip" }
	await expect(extractTextInWorker(zipFile)).rejects.toThrow("unsupported attachment content type")
	expect(await extractTextInWorker(toTextFile("still here"))).toBe("still here")
})

// a file past its deadline rejects as too large or too slow, and the file queued behind it is read by a new worker
// thread
test("extractTextInWorker stops only the file past its deadline", async () => {
	const longHtml = { contentType: "text/html", bytes: toLongHtmlBytes(), deadline: performance.now() + 1 }
	const slowExtraction = extractTextInWorker(longHtml)
	const queuedExtraction = extractTextInWorker(toTextFile("queued behind it"))
	await expect(slowExtraction).rejects.toBeInstanceOf(AttachmentTimeLimitError)
	expect(await queuedExtraction).toBe("queued behind it")
})

// a detached buffer the worker thread cannot take rejects, and the queue keeps serving
test("extractTextInWorker rejects bytes it cannot transfer and keeps the queue", async () => {
	const detachedFile = toTextFile("moved away")
	structuredClone(detachedFile.bytes.buffer, { transfer: [detachedFile.bytes.buffer] })
	await expect(extractTextInWorker(detachedFile)).rejects.toThrow()
	expect(await extractTextInWorker(toTextFile("still serving"))).toBe("still serving")
})

// a file whose deadline passes while it waits leaves the queue as busy, without being read
test("extractTextInWorker rejects a waiting file whose deadline passes", async () => {
	const runningExtraction = extractTextInWorker({
		...toTextFile(""),
		contentType: "text/html",
		bytes: toLongHtmlBytes(),
	})
	const waitingExtraction = extractTextInWorker({ ...toTextFile("never read"), deadline: performance.now() + 1 })
	await expect(waitingExtraction).rejects.toBeInstanceOf(AttachmentBusyError)
	expect(await runningExtraction).toContain("Carl reads every paragraph.")
})

// a file whose request is already out of time rejects without stopping the worker thread
test("extractTextInWorker rejects a file past its deadline before it is posted", async () => {
	const lateFile = { ...toTextFile("too late"), deadline: performance.now() - 1 }
	await expect(extractTextInWorker(lateFile)).rejects.toBeInstanceOf(AttachmentTimeLimitError)
	expect(await extractTextInWorker(toTextFile("on time"))).toBe("on time")
})

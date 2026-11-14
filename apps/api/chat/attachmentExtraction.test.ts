// the api's extraction tests, each with real child processes: a file's text, a file that cannot be read, a file past
// its deadline, which never fails another file, and the turns the waiting files take by user
import { expect, test } from "bun:test"
import { DOCX_TYPE } from "@carlnotes/contracts/attachmentTypes"
import { AttachmentExtractionLimitError } from "@carlnotes/pipeline/attachExtraction"
import { toDocxFixtureBytes, toOversizedZipBytes, toPagedPdfBytes } from "@carlnotes/pipeline/attachTestFixtures"
import { extractTextInChildProcess, toExtractionDeadline } from "./attachmentExtraction"

// how long a slow file holds its child process before its deadline stops it, in milliseconds. the file takes
// seconds to read, so its deadline always comes first
const SLOW_FILE_HOLD_MS = 1_000

// one user's file to extract
type ExtractableFile = { contentType: string; bytes: Uint8Array; deadline: number; userId: string }

// a text file's bytes, read before the extraction deadline, sent by the one user most tests extract for
function toTextFile(text: string): ExtractableFile {
	const bytes = new TextEncoder().encode(text)
	return { contentType: "text/plain", bytes, deadline: toExtractionDeadline(), userId: "user-1" }
}

// an html page long enough that a child process takes more than a millisecond to read it
function toLongHtmlBytes(): Uint8Array {
	return new TextEncoder().encode("<p>Carl reads every paragraph.</p>".repeat(60_000))
}

// a PDF of thousands of one-letter pages, whose text never reaches the attachment text limit, so a chat reads it to
// its last page. its deadline stops its child process long before the read ends
function toSlowFile(): ExtractableFile {
	const bytes = toPagedPdfBytes(Array.from({ length: 12_000 }, () => "c"))
	return { contentType: "application/pdf", bytes, deadline: performance.now() + SLOW_FILE_HOLD_MS, userId: "user-1" }
}

// a text file's words come back from the child process as extractText reads them
test("extractTextInChildProcess returns a file's text from a child process", async () => {
	expect(await extractTextInChildProcess(toTextFile("Carl reads the attachment."))).toBe("Carl reads the attachment.")
})

// a view into a larger buffer sends only its own bytes
test("extractTextInChildProcess reads only a view's own bytes", async () => {
	const buffer = new TextEncoder().encode("skip-Carl-skip")
	expect(await extractTextInChildProcess({ ...toTextFile(""), bytes: buffer.subarray(5, 9) })).toBe("Carl")
})

// a PDF that cannot be parsed rejects, so the route can reject the chat turn
test("extractTextInChildProcess rejects a file that cannot be read", async () => {
	const unreadablePdf = { ...toTextFile("not a pdf"), contentType: "application/pdf" }
	await expect(extractTextInChildProcess(unreadablePdf)).rejects.toThrow()
})

// a type with no extractor rejects with the message extractText throws, and the next file is read
test("extractTextInChildProcess rejects a type with no extractor and reads the next file", async () => {
	const zipFile = { ...toTextFile("PK"), contentType: "application/zip" }
	await expect(extractTextInChildProcess(zipFile)).rejects.toThrow("unsupported attachment content type")
	expect(await extractTextInChildProcess(toTextFile("still here"))).toBe("still here")
})

// a small Word file whose zip directory declares gigabytes rejects as a file that cannot be read, which a caller
// rejects in words, and neither as too large nor as busy
test("extractTextInChildProcess rejects a zipped file that declares a huge unpacked size", async () => {
	const oversizedDocx = { ...toTextFile(""), contentType: DOCX_TYPE, bytes: toOversizedZipBytes(toDocxFixtureBytes()) }
	const rejection = await extractTextInChildProcess(oversizedDocx).catch((error) => error)
	expect(rejection.message).toContain("unpacked bytes")
	expect(rejection).not.toBeInstanceOf(AttachmentExtractionLimitError)
})

// a file past its deadline rejects as too large to read in time, and the file queued behind it is read by a new child
// process
test("extractTextInChildProcess stops only the file past its deadline", async () => {
	const longHtml = {
		...toTextFile(""),
		contentType: "text/html",
		bytes: toLongHtmlBytes(),
		deadline: performance.now() + 1,
	}
	const slowExtraction = extractTextInChildProcess(longHtml)
	const queuedExtraction = extractTextInChildProcess(toTextFile("queued behind it"))
	await expect(slowExtraction).rejects.toMatchObject({ limit: "time" })
	expect(await queuedExtraction).toBe("queued behind it")
})

// bytes that cannot be sent to a child process reject, and the next file is read
test("extractTextInChildProcess rejects bytes it cannot send and reads the next file", async () => {
	const detachedFile = toTextFile("moved away")
	structuredClone(detachedFile.bytes.buffer, { transfer: [detachedFile.bytes.buffer] })
	await expect(extractTextInChildProcess(detachedFile)).rejects.toThrow()
	expect(await extractTextInChildProcess(toTextFile("still serving"))).toBe("still serving")
})

// a file whose deadline passes while it waits behind the same user's file leaves the wait as busy, without being read
test("extractTextInChildProcess rejects a waiting file whose deadline passes", async () => {
	const runningExtraction = extractTextInChildProcess({
		...toTextFile(""),
		contentType: "text/html",
		bytes: toLongHtmlBytes(),
	})
	const waitingExtraction = extractTextInChildProcess({ ...toTextFile("never read"), deadline: performance.now() + 1 })
	await expect(waitingExtraction).rejects.toMatchObject({ limit: "wait" })
	expect(await runningExtraction).toContain("Carl reads every paragraph.")
})

// a file whose request is already out of time rejects without a child process
test("extractTextInChildProcess rejects a file past its deadline before it is sent", async () => {
	const lateFile = { ...toTextFile("too late"), deadline: performance.now() - 1 }
	await expect(extractTextInChildProcess(lateFile)).rejects.toMatchObject({ limit: "time" })
	expect(await extractTextInChildProcess(toTextFile("on time"))).toBe("on time")
})

// one user's files never hold another user's file: the other user's file is read while the first user's slow file
// holds a child process, and the first user's next file waits for the slow one
test("extractTextInChildProcess reads another user's file while one user's slow file is read", async () => {
	const settledNames: string[] = []
	const recordSettled = (name: string) => () => settledNames.push(name)
	const slowExtraction = extractTextInChildProcess({ ...toSlowFile(), userId: "user-1" })
	const nextExtraction = extractTextInChildProcess({ ...toTextFile("the first user's next file"), userId: "user-1" })
	const otherExtraction = extractTextInChildProcess({ ...toTextFile("the other user's file"), userId: "user-2" })

	// record the order the three settle in
	await Promise.all([
		slowExtraction.then(recordSettled("slow"), recordSettled("slow")),
		nextExtraction.then(recordSettled("next")),
		otherExtraction.then(recordSettled("other")),
	])
	expect(settledNames).toEqual(["other", "slow", "next"])
	await expect(slowExtraction).rejects.toMatchObject({ limit: "time" })
	expect(await otherExtraction).toBe("the other user's file")
})

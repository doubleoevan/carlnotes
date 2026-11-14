// extraction tests, each with real child processes: what a chat and a Topic keep of a file, a file that is itself at
// fault, a file past the memory limit or its deadline, which ends its own child process alone, and the turns the
// waiting files take by sender
import { expect, test } from "bun:test"
import { DOCX_TYPE, XLSX_TYPE } from "@carlnotes/contracts/attachmentTypes"
import { CHAT_ATTACHMENT_TEXT_CHARS, clipAttachmentText } from "@carlnotes/contracts/chat"
import { ATTACHMENT_NO_TEXT_REASON, MAX_ATTACHMENT_CONTEXT_CHARS } from "@carlnotes/contracts/topics"
import { AttachmentValidationError } from "./attachContentType"
import {
	AttachmentExtractionLimitError,
	extractChatAttachmentText,
	extractTopicAttachment,
	toExtractedAttachment,
} from "./attachExtraction"
import { toDocxFixtureBytes, toOversizedZipBytes, toPagedPdfBytes, toRowsWorkbookBytes } from "./attachTestFixtures"
import { readWholeWorkbookLines } from "./attachWorkbook"

// how long a slow file holds its child process before its deadline stops it, in milliseconds. the file takes
// seconds to read, so its deadline always comes first
const SLOW_FILE_HOLD_MS = 1_000

// when a file's time runs out if nothing should stop it
function toFarDeadline(): number {
	return performance.now() + 60_000
}

// a text file a chat reads at once, sent by the given sender
function readTextFile(text: string, turnKey: string): Promise<string> {
	const bytes = new TextEncoder().encode(text)
	return extractChatAttachmentText({ contentType: "text/plain", bytes, turnKey, deadline: toFarDeadline() })
}

// a PDF of thousands of pages that a Topic reads to its last page, sent by the given sender. its deadline stops its
// child process long before the read ends, so the extraction rejects
function readSlowFile(turnKey: string): Promise<unknown> {
	const pageLines = Array.from({ length: 12_000 }, (_, index) => `Carl reads page ${index + 1}`)
	return extractTopicAttachment({
		contentType: "application/pdf",
		filename: "slow.pdf",
		bytes: toPagedPdfBytes(pageLines),
		turnKey,
		deadline: performance.now() + SLOW_FILE_HOLD_MS,
	})
}

// the limit that ended an extraction, or null for one that was not ended by a limit
async function toEndingLimit(extraction: Promise<unknown>): Promise<string | null> {
	try {
		await extraction
		return null
	} catch (error) {
		return error instanceof AttachmentExtractionLimitError ? error.limit : null
	}
}

// record the order in which extractions settle, by the name each is given
function toSettleOrder(extractions: Record<string, Promise<unknown>>): {
	settledNames: string[]
	settled: Promise<unknown>
} {
	const settledNames: string[] = []
	const settlements = Object.entries(extractions).map(([name, extraction]) =>
		extraction.then(
			() => settledNames.push(name),
			() => settledNames.push(name),
		),
	)
	return { settledNames, settled: Promise.all(settlements) }
}

// a text file's words come back from the child process, and a view into a larger buffer sends only its own bytes
test("extractChatAttachmentText returns a file's text from a child process", async () => {
	expect(await readTextFile("Carl reads the attachment.", "user-1")).toBe("Carl reads the attachment.")
	const bytes = new TextEncoder().encode("skip-Carl-skip").subarray(5, 9)
	const viewText = extractChatAttachmentText({
		contentType: "text/plain",
		bytes,
		turnKey: "user-1",
		deadline: toFarDeadline(),
	})
	expect(await viewText).toBe("Carl")
})

// a workbook longer than a chat keeps is read as a stream and comes back clipped, with the marker naming the whole
// text's length, as the whole text clipped would read
test("extractChatAttachmentText clips a long workbook to the text a chat keeps", async () => {
	// a sheet of 9,000 rows, whose text runs far past the attachment text limit
	const bytes = await toRowsWorkbookBytes(9_000)

	// the whole text, as the whole-file reader writes it
	const wholeLines: string[] = []
	await readWholeWorkbookLines(bytes, (line) => wholeLines.push(line))
	const wholeText = wholeLines.join("\n")
	expect(wholeText.length).toBeGreaterThan(CHAT_ATTACHMENT_TEXT_CHARS)

	// the child process's text is the whole text clipped
	const chatText = await extractChatAttachmentText({
		contentType: XLSX_TYPE,
		bytes,
		turnKey: "user-1",
		deadline: toFarDeadline(),
	})
	expect(chatText).toBe(clipAttachmentText(wholeText))
	expect(chatText).toContain(`It runs ${wholeText.length.toLocaleString("en-US")} characters`)
})

// a workbook far past the size read whole is read as a stream, within a memory limit that reading it whole passes
test("a workbook of 30,000 rows is read within a memory limit that reading it whole passes", async () => {
	// reading this workbook whole takes about 500 MB, and the child process may take 320
	const extractedAttachment = await extractTopicAttachment({
		contentType: XLSX_TYPE,
		filename: "queries.xlsx",
		bytes: await toRowsWorkbookBytes(30_000),
		turnKey: "topic-1",
		deadline: toFarDeadline(),
		memoryLimitBytes: 320 * 1024 * 1024,
	})

	// every row was counted, and the limit of rows was kept
	const tableLines = extractedAttachment.verbatimContext?.split("\n") ?? []
	expect(tableLines[0]).toStartWith('[file "queries.xlsx", sheet "Queries": 29999 rows, columns: column 0,')
	expect(tableLines.at(-1)).toBe("[29849 rows omitted]")
})

// a short document is stored as written, a longer one is chunked with its whole length, and a csv is table text
test("extractTopicAttachment returns what a Topic keeps of a document and of a table", async () => {
	const limits = { turnKey: "topic-1", deadline: toFarDeadline() }
	const toBytes = (text: string): Uint8Array => new TextEncoder().encode(text)

	// a short document, and one past the attachment context limit
	const shortDocument = { contentType: "text/plain", filename: "notes.txt", bytes: toBytes("Carl keeps short notes.") }
	const longText = "word ".repeat(MAX_ATTACHMENT_CONTEXT_CHARS)
	const longDocument = { contentType: "text/plain", filename: "book.txt", bytes: toBytes(longText) }
	expect(await extractTopicAttachment({ ...shortDocument, ...limits })).toEqual({
		chunks: [],
		charCount: 23,
		verbatimContext: "Carl keeps short notes.",
	})
	expect(await extractTopicAttachment({ ...longDocument, ...limits })).toEqual(toExtractedAttachment(longText))

	// a csv's rows under a heading, with no model call
	const csv = { contentType: "text/csv", filename: "agents.csv", bytes: toBytes("Agent,Status\nAmy,sent") }
	expect(await extractTopicAttachment({ ...csv, ...limits })).toEqual({
		chunks: [],
		charCount: 21,
		verbatimContext: '[file "agents.csv": 1 rows, columns: Agent, Status]\nAgent,Status\nAmy,sent',
	})
})

// a file with nothing to read, a type with no extractor, and a zip that declares too large an unpacked size are each
// the file's own fault, and a file that cannot be parsed is a failed read
test("an extraction rejects a file that is itself at fault apart from a failed read", async () => {
	const limits = { turnKey: "user-1", deadline: toFarDeadline() }
	const blankFile = { contentType: "text/plain", filename: "blank.txt", bytes: new TextEncoder().encode("  \n ") }
	const blankExtraction = extractTopicAttachment({ ...blankFile, ...limits })
	await expect(blankExtraction).rejects.toBeInstanceOf(AttachmentValidationError)
	await expect(blankExtraction).rejects.toThrow(ATTACHMENT_NO_TEXT_REASON)

	// a type with no extractor, and a small Word file that declares gigabytes
	const zipFile = { contentType: "application/zip", bytes: new TextEncoder().encode("PK") }
	await expect(extractChatAttachmentText({ ...zipFile, ...limits })).rejects.toThrow(
		"unsupported attachment content type",
	)
	const oversizedDocx = { contentType: DOCX_TYPE, bytes: toOversizedZipBytes(toDocxFixtureBytes()) }
	const oversizedExtraction = extractChatAttachmentText({ ...oversizedDocx, ...limits })
	await expect(oversizedExtraction).rejects.toBeInstanceOf(AttachmentValidationError)
	await expect(oversizedExtraction).rejects.toThrow("unpacked bytes")

	// a PDF that cannot be parsed fails its read, and names no limit and no fault of the file's own
	const unreadablePdf = { contentType: "application/pdf", bytes: new TextEncoder().encode("not a pdf") }
	const unreadableError = await extractChatAttachmentText({ ...unreadablePdf, ...limits }).catch((error) => error)
	expect(unreadableError).toBeInstanceOf(Error)
	expect(unreadableError).not.toBeInstanceOf(AttachmentValidationError)
	expect(unreadableError).not.toBeInstanceOf(AttachmentExtractionLimitError)
})

// a file whose child process passes the memory limit ends alone: another sender's file, read at the same time by
// another child process, comes back, and so does the next file of the sender whose file was stopped
test("a file past the memory limit fails alone while another sender's file is read", async () => {
	// one byte is under what any child process takes, so the watchdog stops this one before it reads the file
	const bytes = toDocxFixtureBytes()
	const limitedExtraction = extractChatAttachmentText({
		contentType: DOCX_TYPE,
		bytes,
		turnKey: "user-1",
		deadline: toFarDeadline(),
		memoryLimitBytes: 1,
	})
	const otherExtraction = extractChatAttachmentText({
		contentType: DOCX_TYPE,
		bytes,
		turnKey: "user-2",
		deadline: toFarDeadline(),
	})

	// the limited file names the memory limit, and the other sender's file is read whole
	expect(await toEndingLimit(limitedExtraction)).toBe("memory")
	expect(await otherExtraction).toContain("Carl reads the word document.")
	expect(await readTextFile("the next file is read", "user-1")).toBe("the next file is read")
})

// a file still being read at its deadline stops its own child process, and the sender's next file is read by a new one
test("a file read past its deadline is stopped, and the file behind it is read", async () => {
	const slowExtraction = readSlowFile("user-1")
	const nextExtraction = readTextFile("queued behind it", "user-1")
	const { settledNames, settled } = toSettleOrder({ slow: slowExtraction, next: nextExtraction })
	expect(await toEndingLimit(slowExtraction)).toBe("time")
	expect(await nextExtraction).toBe("queued behind it")

	// the sender's files are read one at a time, in the order they were sent
	await settled
	expect(settledNames).toEqual(["slow", "next"])
})

// a file whose deadline passes while it waits leaves the wait without being read, and a file whose time is already out
// never waits
test("a file that waits past its deadline is rejected as waiting", async () => {
	const slowExtraction = readSlowFile("user-1")
	const bytes = new TextEncoder().encode("never read")
	const waitingDeadline = performance.now() + SLOW_FILE_HOLD_MS / 4
	const waitingExtraction = extractChatAttachmentText({
		contentType: "text/plain",
		bytes,
		turnKey: "user-1",
		deadline: waitingDeadline,
	})
	expect(await toEndingLimit(waitingExtraction)).toBe("wait")

	// a file sent after its deadline rejects at once as out of time, while the slow file is still being read
	const lateExtraction = extractChatAttachmentText({
		contentType: "text/plain",
		bytes,
		turnKey: "user-2",
		deadline: performance.now() - 1,
	})
	expect(await toEndingLimit(lateExtraction)).toBe("time")
	expect(await toEndingLimit(slowExtraction)).toBe("time")
})

// one sender's files never hold every child process: another sender's file is read while the first sender's slow file
// is, and the first sender's next file waits for the slow one
test("another sender's file is read while one sender's slow file holds a child process", async () => {
	const { settledNames, settled } = toSettleOrder({
		firstSenderSlow: readSlowFile("user-1"),
		firstSenderNext: readTextFile("the first sender's next file", "user-1"),
		secondSender: readTextFile("the second sender's file", "user-2"),
	})
	await settled
	expect(settledNames).toEqual(["secondSender", "firstSenderSlow", "firstSenderNext"])
})

// two child processes read at once, so a third sender's file waits while two senders' slow files are read, and a file
// that waits past its deadline is rejected as waiting
test("a third sender's file waits while two child processes are reading", async () => {
	// two senders' slow files take both child processes
	const slowLimits = [toEndingLimit(readSlowFile("user-1")), toEndingLimit(readSlowFile("user-2"))]

	// a third sender's file whose deadline comes before either slow file's, and a fourth sender's file that can wait
	const bytes = new TextEncoder().encode("the third sender's file")
	const impatientExtraction = extractChatAttachmentText({
		contentType: "text/plain",
		bytes,
		turnKey: "user-3",
		deadline: performance.now() + SLOW_FILE_HOLD_MS / 4,
	})
	const patientExtraction = readTextFile("the fourth sender's file", "user-4")

	// the impatient file gives up waiting, and the patient one is read once a slow file's child process ends
	const { settledNames, settled } = toSettleOrder({
		impatient: impatientExtraction,
		slow: Promise.all(slowLimits),
		patient: patientExtraction,
	})
	expect(await toEndingLimit(impatientExtraction)).toBe("wait")
	expect(await patientExtraction).toBe("the fourth sender's file")
	expect(await Promise.all(slowLimits)).toEqual(["time", "time"])

	// the patient file's text came back after the impatient file gave up, and after both slow files were stopped
	await settled
	expect(settledNames).toEqual(["impatient", "slow", "patient"])
})

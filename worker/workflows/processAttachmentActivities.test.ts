// attachment activity tests: short documents stored as written, screened or not, and a long document chunked
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "../../db/connectionPoolStub"
import { attachments } from "../../db/schema"
import * as guard from "../guard"
import * as store from "../store"
import { extractAttachmentText } from "./processAttachmentActivities"

// put back the connection pool and the module mocks after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// stub one stored text file, read through its attachment row, and a scanner that returns the given outcome
function stubTextAttachment(fileText: string, screenOutcome: guard.ScreenOutcome): void {
	// return the attachment row for any query, with only the columns that extraction reads filled in
	const attachmentRow = toTableRow(attachments, {
		id: "attachment-1",
		filename: "chen-family.txt",
		contentType: "text/plain",
		objectKey: "attachments/chen-family.txt",
	})
	stubConnectionPool(() => [attachmentRow])

	// the stored bytes, and a screen that returns the text unchanged
	spyOn(store, "getAttachmentBytes").mockResolvedValue(new TextEncoder().encode(fileText))
	spyOn(guard, "screenText").mockImplementation(async (text) => ({
		isFlagged: false,
		detectors: [],
		text,
		outcome: screenOutcome,
	}))
}

test("a list of 40 names is stored exactly as written, and a long document is chunked to summarize", async () => {
	// 40 numbered names, far under the context limit
	const namesText = Array.from({ length: 40 }, (_, i) => `${i + 1}. Chen Family Member ${i + 1}`).join("\n")
	stubTextAttachment(namesText, "skipped")

	// every name is in the stored context, and nothing goes to the summarizer
	const extractedShortDocument = await extractAttachmentText("attachment-1")
	expect(extractedShortDocument).toEqual({
		chunks: [],
		charCount: namesText.length,
		flaggedReason: null,
		verbatimContext: namesText,
	})

	// a document past the 20,000-character limit is chunked instead
	mock.restore()
	stubTextAttachment("word ".repeat(5000), "skipped")
	const extractedLongDocument = await extractAttachmentText("attachment-1")
	expect(extractedLongDocument.verbatimContext).toBeNull()
	expect(extractedLongDocument.chunks.length).toBeGreaterThan(0)
})

test("a short document is stored as written if a configured scanner does not finish its screen", async () => {
	// a scanner that was configured and did not answer passes the text unscreened
	stubTextAttachment("1. Chen Family Member 1", "failed")
	const extractedShortDocument = await extractAttachmentText("attachment-1")
	expect(extractedShortDocument.verbatimContext).toBe("1. Chen Family Member 1")
})

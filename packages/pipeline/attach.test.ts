// attachment tests: the content-type resolver, the table text, the topic context hash, and the ingestion
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { DOCX_TYPE, XLSX_TYPE } from "@carlnotes/contracts/attachmentTypes"
import { MAX_ATTACHMENT_CONTEXT_CHARS } from "@carlnotes/contracts/topics"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { attachments } from "@carlnotes/db/schema/topics"
import * as store from "@carlnotes/db/store"
import { FetchStatusError } from "@carlnotes/server/publicFetch"
// the methods to test, and the ingestion, which the pool stub keeps off the database
import { ingestAttachment, ingestUrlAttachment, toTopicContextHash } from "./attach"
import { AttachmentValidationError, isTableFileType, toCanonicalContentType } from "./attachContentType"
import { MAX_TABLE_CHARS, MAX_TABLE_ROWS, toTableText } from "./attachTable"
import * as scrape from "./scrape"
import * as temporalClient from "./temporalClient"

// a reported type an extractor knows stands as it is
test("toCanonicalContentType keeps a reported type the gate knows", () => {
	expect(toCanonicalContentType("text/csv", "list.csv")).toBe("text/csv")
	expect(toCanonicalContentType("application/pdf", "paper.pdf")).toBe("application/pdf")
	expect(toCanonicalContentType(XLSX_TYPE, "tracker.xlsx")).toBe(XLSX_TYPE)
})

// windows with Excel installed reports a csv as a legacy Excel type, which resolves by its extension
test("toCanonicalContentType resolves a misreported csv by its extension", () => {
	expect(toCanonicalContentType("application/vnd.ms-excel", "submissions.csv")).toBe("text/csv")
})

// browsers often report the OOXML types as octet-stream or nothing at all
test("toCanonicalContentType resolves a typeless docx and xlsx by their extensions", () => {
	expect(toCanonicalContentType("application/octet-stream", "notes.docx")).toBe(DOCX_TYPE)
	expect(toCanonicalContentType("", "tracker.xlsx")).toBe(XLSX_TYPE)
})

// a type nothing recognizes keeps the reported value, which the gate then rejects with its own message
test("toCanonicalContentType leaves an unknown type and extension alone", () => {
	expect(toCanonicalContentType("application/zip", "archive.zip")).toBe("application/zip")
	expect(toCanonicalContentType("application/octet-stream", "README")).toBe("application/octet-stream")
})

// csv, tsv, and a workbook become table text. prose types never do
test("isTableFileType admits only the types that have rows", () => {
	expect(isTableFileType("text/csv")).toBe(true)
	expect(isTableFileType("text/tab-separated-values")).toBe(true)
	expect(isTableFileType(XLSX_TYPE)).toBe(true)
	expect(isTableFileType("text/plain")).toBe(false)
	expect(isTableFileType("application/pdf")).toBe(false)
	expect(isTableFileType(DOCX_TYPE)).toBe(false)
})

// a workbook row that reads like a sheet marker must not open one, no matter how its cells were split
test("toTableText reads a marker-looking workbook row as data", () => {
	// two cells that each pass on their own join into a line that matches the marker
	const forgedRow = toTableText({
		serializedText: "=== sheet: Real ===\nHeader\n=== sheet: a,b ===",
		filename: "book.xlsx",
		contentType: XLSX_TYPE,
	})
	expect(forgedRow.split("\n").filter((line) => line.startsWith("[file"))).toHaveLength(1)
	expect(forgedRow).not.toContain('sheet "a,b"')
})

// a header too wide to fit the character budget leaves its sheet out instead of spending past it
test("toTableText omits a sheet whose header alone crosses the budget", () => {
	const wideHeader = Array.from({ length: 4000 }, (_, index) => `col${index}`).join(",")
	const tableText = toTableText({
		serializedText: `${wideHeader}\nvalue`,
		filename: "wide.csv",
		contentType: "text/csv",
	})
	expect(tableText.length).toBeLessThanOrEqual(MAX_TABLE_CHARS)
	expect(tableText).toBe("[1 rows omitted]")
})

// a csv's own lines are the user's text, so one reading like a marker must not start a sheet
test("toTableText reads a marker-looking csv row as data", () => {
	const csv = "Note\n=== sheet: Fake ===\nplain"
	const tableText = toTableText({ serializedText: csv, filename: "notes.csv", contentType: "text/csv" })

	// a csv is one unnamed sheet, so the marker-looking row stays a row of data
	expect(tableText).toContain("=== sheet: Fake ===")
	expect(tableText).not.toContain('sheet "Fake"')
	expect(tableText.split("\n").filter((line) => line.startsWith("[file"))).toHaveLength(1)
})

// a small csv becomes table text whole: the computed line, the header row, and every data row verbatim
test("toTableText keeps a small file's rows verbatim with no model call", () => {
	const csv = "Agency,Agent,Status\nWriters House,Amy,queried\nFolio,Jeff,passed"
	const tableText = toTableText({ serializedText: csv, filename: "tracker.csv", contentType: "text/csv" })
	expect(tableText).toContain('[file "tracker.csv": 2 rows, columns: Agency, Agent, Status]')
	expect(tableText).toContain("Writers House,Amy,queried")
	expect(tableText).toContain("Folio,Jeff,passed")
	expect(tableText).not.toContain("omitted")
})

// past the row budget the table text stops on a whole row and states what it left out
test("toTableText limits by rows and names the omitted count", () => {
	const tableRows = Array.from({ length: MAX_TABLE_ROWS + 40 }, (_, index) => `agent ${index},status ${index}`)
	const tableText = toTableText({
		serializedText: `Agent,Status\n${tableRows.join("\n")}`,
		filename: "big.csv",
		contentType: "text/csv",
	})
	const lines = tableText.split("\n")
	expect(lines[lines.length - 1]).toBe("[40 rows omitted]")
	expect(lines.length).toBe(MAX_TABLE_ROWS + 3)
})

// very wide rows hit the character budget before the row budget, and no row is ever cut mid-way
test("toTableText stops on the character budget before the row budget", () => {
	const wideRow = "x".repeat(1000)
	const tableRows = Array.from({ length: 100 }, () => wideRow)
	const tableText = toTableText({
		serializedText: `Header\n${tableRows.join("\n")}`,
		filename: "wide.csv",
		contentType: "text/csv",
	})
	expect(tableText.length).toBeLessThanOrEqual(MAX_ATTACHMENT_CONTEXT_CHARS)
	expect(tableText).toContain("rows omitted]")

	// every kept line is whole: a data line is the full row or a bracketed marker, never a fragment
	for (const line of tableText.split("\n").slice(2, -1)) {
		expect(line).toBe(wideRow)
	}
})

// each of a workbook's sheets gets its own heading, sharing one budget between them
test("toTableText writes both sheets under one shared budget", () => {
	const firstSheetRows = Array.from({ length: MAX_TABLE_ROWS - 10 }, (_, index) => `a${index},b${index}`)
	const serialized = [
		"=== sheet: First ===",
		"ColA,ColB",
		...firstSheetRows,
		// the second sheet arrives with ten rows of budget left
		"=== sheet: Second ===",
		"ColC",
		...Array.from({ length: 30 }, (_, index) => `c${index}`),
	].join("\n")

	// the second sheet appears with only the budget the first left over, and the trailing line covers the rest
	const tableText = toTableText({
		serializedText: serialized,
		filename: "book.xlsx",
		contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	})
	expect(tableText).toContain('sheet "First": 140 rows')
	expect(tableText).toContain('sheet "Second": 30 rows')
	expect(tableText).toContain("c9")
	expect(tableText.split("\n")).not.toContain("c10")
	expect(tableText).toContain("[20 rows omitted]")
})

// a browser reports a csv as text/plain more often than as text/csv, and a table read as prose is the whole feature lost
test("toCanonicalContentType prefers a known extension over a generic reported type", () => {
	for (const reportedType of ["text/plain", "application/octet-stream", ""]) {
		expect(toCanonicalContentType(reportedType, "sales.csv")).toBe("text/csv")
		expect(isTableFileType(toCanonicalContentType(reportedType, "sales.csv"))).toBe(true)
		expect(toCanonicalContentType(reportedType, "book.xlsx")).toBe(XLSX_TYPE)
		expect(toCanonicalContentType(reportedType, "manuscript.docx")).toBe(DOCX_TYPE)
	}

	// a plain text file keeps the type it reported, and an extension nobody knows falls back to it too
	expect(toCanonicalContentType("text/plain", "notes.txt")).toBe("text/plain")
	expect(toCanonicalContentType("text/plain", "data.weird")).toBe("text/plain")
	expect(toCanonicalContentType("text/plain", "noextension")).toBe("text/plain")
})

// an edited prompt and a changed attachment set each have to move the hash, while spacing alone must not
test("toTopicContextHash changes with the context and ignores surrounding whitespace", () => {
	const prompt = "Obscure art: outsider artists, self-taught painters, and the galleries that show them."
	const contextWithAttachment = `${prompt}\n\n[attachment: catalogue.pdf]\nA 1994 exhibition catalogue.`

	// an edited prompt, an attachment added, and an attachment removed each ask a different question
	expect(toTopicContextHash(prompt)).not.toBe(toTopicContextHash(`${prompt} Focus on the 1990s.`))
	expect(toTopicContextHash(prompt)).not.toBe(toTopicContextHash(contextWithAttachment))

	// the same context asks the same question, no matter how it is spaced
	expect(toTopicContextHash(prompt)).toBe(toTopicContextHash(`${prompt}\n`))
	expect(toTopicContextHash(contextWithAttachment)).toBe(toTopicContextHash(contextWithAttachment))
})

// put the pool and every spy back after each ingestion test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// ingest a small text file into topic-1
async function ingestTextAttachment(): Promise<Awaited<ReturnType<typeof ingestAttachment>>> {
	return ingestAttachment({
		topicId: "topic-1",
		filename: "notes.txt",
		contentType: "text/plain",
		bytes: new TextEncoder().encode("hello"),
	})
}

// the key is recorded as pending with a grace period before the upload. a failed row insert deletes the object through
// deleteStoredObject, and a failed delete leaves the key pending
test("an upload whose row insert fails leaves its key pending", async () => {
	// an upload that stores, a delete that fails, and the error log quiet
	spyOn(store, "uploadAttachment").mockResolvedValue(undefined)
	const deleteStoredObjectSpy = spyOn(store, "deleteStoredObject").mockResolvedValue(false)
	spyOn(console, "error").mockImplementation(() => {})

	// the pool, whose attachment insert fails
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith('insert into "attachments"')) {
			throw new Error("insert failed")
		}
		return text.includes('from "topics"') ? [["topic-1"]] : []
	})

	// the ingestion fails with the insert's error, which the driver names by its statement
	await expect(ingestTextAttachment()).rejects.toThrow('insert into "attachments"')

	// the key was recorded before the upload with a try time, recorded again with none before the delete, and never cleared
	const pendingObjectDeletionInserts = sentQueries.filter(({ text }) =>
		text.startsWith('insert into "pending_object_deletions"'),
	)
	expect(pendingObjectDeletionInserts).toHaveLength(2)
	expect(pendingObjectDeletionInserts[0]?.values).toHaveLength(2)
	expect(pendingObjectDeletionInserts[1]?.values).toHaveLength(1)
	expect(sentQueries.some(({ text }) => text.startsWith('delete from "pending_object_deletions"'))).toBe(false)
	expect(deleteStoredObjectSpy).toHaveBeenCalledTimes(1)
	expect(String(deleteStoredObjectSpy.mock.calls[0]?.[0])).toStartWith("topics/topic-1/attachments/")
})

// a successful upload clears the key in the row insert's transaction, so nothing stays pending
test("a successful upload leaves no key pending", async () => {
	// a topic that exists, an upload that stores, a row insert that returns the row, and a workflow that starts
	spyOn(store, "uploadAttachment").mockResolvedValue(undefined)
	const deleteStoredObjectSpy = spyOn(store, "deleteStoredObject")
	spyOn(temporalClient, "startAttachmentWorkflow").mockResolvedValue(undefined)
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith('insert into "attachments"')) {
			return [
				toTableRow(attachments, { id: "attachment-1", topicId: "topic-1", objectKey: "k", filename: "notes.txt" }),
			]
		}
		return text.includes('from "topics"') ? [["topic-1"]] : []
	})

	// the ingestion returns the row, the key's pending deletion is cleared, and nothing is deleted
	expect((await ingestTextAttachment()).id).toBe("attachment-1")
	expect(sentQueries.some(({ text }) => text.startsWith('insert into "pending_object_deletions"'))).toBe(true)
	expect(sentQueries.some(({ text }) => text.startsWith('delete from "pending_object_deletions"'))).toBe(true)
	expect(deleteStoredObjectSpy).not.toHaveBeenCalled()
})

// a page its host refuses is the user's to fix, so it is a validation error. a scraper with no key, a scraper error, and
// any other fault are infrastructure failures, which are rethrown as they are so the error report names them
test("ingestUrlAttachment rejects a page its host refuses and rethrows any other fetch failure", async () => {
	// the host answers 404
	const fetchContentSpy = spyOn(scrape, "fetchContent").mockRejectedValue(
		new FetchStatusError("firecrawl scrape https://a.test/page", 404),
	)
	const hostRejection = await ingestUrlAttachment("topic-1", "https://a.test/page").catch((error: unknown) => error)
	expect(hostRejection).toBeInstanceOf(AttachmentValidationError)
	expect((hostRejection as Error).message).toBe("this page could not be read: https://a.test/page")

	// the scraper has no key, and the scraper fails
	for (const infrastructureError of [
		new Error("FIRECRAWL_API_KEY is not set"),
		new FetchStatusError("firecrawl scrape https://a.test/page", 503),
	]) {
		fetchContentSpy.mockRejectedValue(infrastructureError)
		const rethrownError = await ingestUrlAttachment("topic-1", "https://a.test/page").catch((error: unknown) => error)
		expect(rethrownError).toBe(infrastructureError)
	}
})

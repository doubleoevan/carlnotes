// extractText tests: a PDF's pages read up to the caller's limit, a Word file, a workbook, a file whose zip directory
// declares too large an unpacked size, a windows-1252 csv, html, and json
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { DOCX_TYPE, XLSX_TYPE } from "@carlnotes/contracts/attachmentTypes"
import mammoth from "mammoth"
import { AttachmentValidationError } from "./attachContentType"
import { toDocxFixtureBytes, toOversizedZipBytes, toPagedPdfBytes, toWorkbookFixtureBytes } from "./attachTestFixtures"
import { extractText, extractTextUpTo } from "./attachText"

// the text the whole-file reader wrote for the workbook fixture
const WORKBOOK_FIXTURE_TEXT = [
	"=== sheet: Submissions ===",
	"Agency,Agent,Sent",
	"Writers House,Amy Berkower,2026-08-04",
	"=== sheet: Notes ===",
	"Note",
	"Follow up in september",
].join("\n")

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// extractText reads every page of a PDF, and extractTextUpTo stops after the page whose text passes maxChars and
// returns the PDF's page count
test("extractTextUpTo stops reading a pdf's pages past maxChars and counts its pages", async () => {
	// pdf.js takes the bytes it reads, so each read gets its own copy
	const pageLines = ["First page", "Second page", "Third page"]
	const wholeText = await extractText("application/pdf", toPagedPdfBytes(pageLines))
	expect(wholeText).toContain("Third page")

	// the first page passes the limit, so the read stops there and names all three pages
	const firstPages = await extractTextUpTo("application/pdf", toPagedPdfBytes(pageLines), 5)
	expect(firstPages.text).toContain("First page")
	expect(firstPages.text).not.toContain("Second page")
	expect(firstPages.pdfPageCount).toBe(3)

	// a PDF read to its last page names no page count
	const allPages = await extractTextUpTo("application/pdf", toPagedPdfBytes(pageLines), 1_000)
	expect(allPages).toEqual({ text: wholeText })
})

// the mammoth library reads the fixture's paragraphs as plain text
test("extractText reads a docx as plain text", async () => {
	const text = await extractText(DOCX_TYPE, toDocxFixtureBytes())
	expect(text).toContain("Carl reads the word document.")
	expect(text).toContain("Second paragraph for the fixture.")
})

// an Excel workbook written by exceljs round-trips through the reader: sheets, cells, and a date serial. the empty
// sheet writes nothing
test("extractText serializes a workbook's sheets as rows", async () => {
	expect(await extractText(XLSX_TYPE, await toWorkbookFixtureBytes())).toBe(WORKBOOK_FIXTURE_TEXT)
})

// a workbook's rows are held only until their text passes maxChars, and the whole text's length is named beside them
test("extractTextUpTo holds a workbook's text until it passes maxChars and names its whole length", async () => {
	// the second line passes 30 characters, so the read holds two lines and counts the rest
	expect(await extractTextUpTo(XLSX_TYPE, await toWorkbookFixtureBytes(), 30)).toEqual({
		text: "=== sheet: Submissions ===\nAgency,Agent,Sent",
		charCount: WORKBOOK_FIXTURE_TEXT.length,
	})

	// a workbook held whole names no length
	expect(await extractTextUpTo(XLSX_TYPE, await toWorkbookFixtureBytes(), 1_000)).toEqual({
		text: WORKBOOK_FIXTURE_TEXT,
	})
})

// a small Word file whose zip directory declares gigabytes is rejected from its directory alone, and never opened
test("extractText rejects a docx that declares a huge unpacked size before it is opened", async () => {
	const extractRawTextSpy = spyOn(mammoth, "extractRawText")
	const oversizedDocxBytes = toOversizedZipBytes(toDocxFixtureBytes())
	expect(oversizedDocxBytes.byteLength).toBeLessThan(2_000)

	// the rejection names the file itself, and the parser never ran
	const extraction = extractText(DOCX_TYPE, oversizedDocxBytes)
	await expect(extraction).rejects.toBeInstanceOf(AttachmentValidationError)
	await expect(extraction).rejects.toThrow("unpacked bytes")
	expect(extractRawTextSpy).not.toHaveBeenCalled()

	// the same file with the size a real document declares is opened
	await extractText(DOCX_TYPE, toDocxFixtureBytes())
	expect(extractRawTextSpy).toHaveBeenCalledTimes(1)
})

// a workbook gets the same check before either reader opens it
test("extractText rejects a workbook that declares a huge unpacked size before it is opened", async () => {
	const extraction = extractText(XLSX_TYPE, toOversizedZipBytes(await toWorkbookFixtureBytes()))
	await expect(extraction).rejects.toBeInstanceOf(AttachmentValidationError)
	await expect(extraction).rejects.toThrow("unpacked bytes")
})

// Excel's plain csv export is windows-1252, where 0xE9 is the accented e
test("extractText decodes a windows-1252 csv without replacement characters", async () => {
	const csvBytes = new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x2c, 0x31, 0x30])
	const text = await extractText("text/csv", csvBytes)
	expect(text).toBe("Café,10")
	expect(text).not.toContain("�")
})

// uploaded HTML extracts to marked-up text with no tags left in it
test("extractText converts html to markdown-shaped text", async () => {
	const html =
		"<html><head><style>p{color:red}</style></head><body><h1>Title</h1><p>Body &amp; soul</p><ul><li>One</li><li>Two</li></ul><script>alert(1)</script></body></html>"
	const text = await extractText("text/html", new TextEncoder().encode(html))
	expect(text).toContain("# Title")
	expect(text).toContain("Body & soul")
	expect(text).toContain("- One")

	// no tag survives, and a script's body is deleted with its tags
	expect(text).not.toMatch(/<[a-z]/i)
	expect(text).not.toContain("alert(1)")
})

// JSON is text to a model, so it decodes as it is
test("extractText decodes json as text", async () => {
	const text = await extractText("application/json", new TextEncoder().encode('{"a":1}'))
	expect(text).toBe('{"a":1}')
})

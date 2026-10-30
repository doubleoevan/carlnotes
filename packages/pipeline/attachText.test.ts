// extractText tests: a PDF's pages read up to the caller's limit, a Word file, a workbook, a windows-1252 csv, html,
// and json
import { expect, test } from "bun:test"
import { DOCX_TYPE, XLSX_TYPE } from "@carlnotes/contracts/attachmentTypes"
import { extractText, extractTextUpTo } from "./attachText"

// a Word document fixture built as the minimal OOXML zip: two paragraphs of plain text
const DOCX_FIXTURE_BASE64 =
	"UEsDBBQAAAAIACl6Il3JTxqw6wAAAK4BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QvU7DMBDeeQrLK4odGBBCSTrwMwJDeYCTfUks7LPlc0v79jht6YAK4933q69b7YIXW8zsIvXyRrVSIJloHU29/Fi/NPdScAGy4CNhL/fIcjVcdet9QhZVTNzLuZT0oDWbGQOwigmpImPMAUo986QTmE+YUN+27Z02kQpSacriIYfuCUfY+CKed/V9LJLRsxSPR+KS1UtIyTsDpeJ6S/ZXSnNKUFV54PDsEl9XgtQXExbk74CT7q0uk51F8Q65vEKoLP0Vs9U2mk2oSvW/zYWecRydwbN+cUs5GmSukwevzkgARz/99WHu4RtQSwMECgAAAAAAKXoiXQAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMEFAAAAAgAKXoiXbmBRHGwAAAAKgEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4J1TRN5pWgaEUJMuCKkrKgeIEjeNaB5KwqO3JwMDIAZG278/y233sDO5YUzGOwZNVQNBJ70yTjM4D8f1DkjKwikxe4cMFkzQ8VV7wlnkspMmExIpiEsMppzDntIkJ7QiVT6gK5PRRytyKaOmQciL0Eg3db2l8d0A/mGSXjGIvWqADEvAf2w/jkbiwcurRZd/nPhKFFlEjZnB3UdF1atdFRYob+nHi/wJUEsDBAoAAAAAACl6Il0AAAAAAAAAAAAAAAAFAAAAd29yZC9QSwMEFAAAAAgAKXoiXRumyOvFAAAAKQEAABEAAAB3b3JkL2RvY3VtZW50LnhtbG2PwWrDMAyG73sK4XvjbIdRQpIeCnuBbQ+g2moSiCUju0379rMLZTB2+YWQ9P2/+sMtrHAlTYvwYF6b1gCxE7/wNJjvr4/d3kDKyB5XYRrMnZI5jC/91nlxl0CcoRA4ddtg5pxjZ21yMwVMjUTiMjuLBsyl1cluoj6qOEqpGITVvrXtuw24sBkL8iT+XmusolXyeERdQQl9gjwTVAI8rZve1pWq+tD49/qTnLCHiIqTYpyhpHlwzsstX5T+I9hnEPv75PgDUEsBAh4DFAAAAAgAKXoiXclPGrDrAAAArgEAABMAAAAAAAAAAQAAAKSBAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECHgMKAAAAAAApeiJdAAAAAAAAAAAAAAAABgAAAAAAAAAAABAA7UEcAQAAX3JlbHMvUEsBAh4DFAAAAAgAKXoiXbmBRHGwAAAAKgEAAAsAAAAAAAAAAQAAAKSBQAEAAF9yZWxzLy5yZWxzUEsBAh4DCgAAAAAAKXoiXQAAAAAAAAAAAAAAAAUAAAAAAAAAAAAQAO1BGQIAAHdvcmQvUEsBAh4DFAAAAAgAKXoiXRumyOvFAAAAKQEAABEAAAAAAAAAAQAAAKSBPAIAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAAFAAUAIAEAADADAAAAAA=="

// a PDF of one line per page, built as the minimal objects pdf.js reads
function toPagedPdfBytes(pageLines: string[]): Uint8Array {
	// a catalog, the page tree, then a page, its content stream, and the font per line
	const pageIds = pageLines.map((_, index) => 3 + index * 2)
	const fontId = 3 + pageLines.length * 2
	const objects = [
		"<</Type/Catalog/Pages 2 0 R>>",
		`<</Type/Pages/Kids[${pageIds.map((pageId) => `${pageId} 0 R`).join(" ")}]/Count ${pageLines.length}>>`,
		...pageLines.flatMap((line, index) => {
			const stream = `BT /F1 24 Tf 72 72 Td (${line}) Tj ET`
			return [
				`<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents ${4 + index * 2} 0 R/Resources<</Font<</F1 ${fontId} 0 R>>>>>>`,
				`<</Length ${stream.length}>>stream\n${stream}\nendstream`,
			]
		}),
		"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
	]
	const body = objects.map((object, index) => `${index + 1} 0 obj${object}endobj`).join("\n")
	return new TextEncoder().encode(`%PDF-1.1\n${body}\ntrailer<</Root 1 0 R>>`)
}

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
	const docxBytes = new Uint8Array(Buffer.from(DOCX_FIXTURE_BASE64, "base64"))
	const text = await extractText(DOCX_TYPE, docxBytes)
	expect(text).toContain("Carl reads the word document.")
	expect(text).toContain("Second paragraph for the fixture.")
})

// an Excel workbook written by exceljs round-trips through the reader: sheets, cells, and a date serial
test("extractText serializes a workbook's sheets as rows", async () => {
	const { default: ExcelJS } = await import("exceljs")
	const workbook = new ExcelJS.Workbook()

	// two sheets with rows, and one chart-like empty sheet that must not serialize
	const submissions = workbook.addWorksheet("Submissions")
	submissions.addRow(["Agency", "Agent", "Sent"])
	submissions.addRow(["Writers House", "Amy Berkower", new Date(Date.UTC(2026, 7, 4))])
	const notes = workbook.addWorksheet("Notes")
	notes.addRow(["Note"])
	notes.addRow(["Follow up in september"])
	workbook.addWorksheet("Empty")

	// the serialized text names each non-empty sheet and keeps the rows verbatim
	const workbookBytes = new Uint8Array(await workbook.xlsx.writeBuffer())
	const text = await extractText(XLSX_TYPE, workbookBytes)
	expect(text).toContain("=== sheet: Submissions ===")
	expect(text).toContain("Agency,Agent,Sent")
	expect(text).toContain("Writers House,Amy Berkower,2026-08-04")
	expect(text).toContain("=== sheet: Notes ===")
	expect(text).not.toContain("Empty")
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

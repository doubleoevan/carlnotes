// attachment extraction tests: the content-type resolver, each extractor, and the table text
import { expect, test } from "bun:test"
// the methods to test, none of which reach the database
import {
	extractText,
	isTableFileType,
	MAX_TABLE_CHARS,
	MAX_TABLE_ROWS,
	toCanonicalContentType,
	toClippedTableText,
	toTableText,
} from "./attach"

// the OOXML media types the resolver and gate know
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

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

// a Word document fixture built as the minimal OOXML zip: two paragraphs of plain text
const DOCX_FIXTURE_BASE64 =
	"UEsDBBQAAAAIACl6Il3JTxqw6wAAAK4BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QvU7DMBDeeQrLK4odGBBCSTrwMwJDeYCTfUks7LPlc0v79jht6YAK4933q69b7YIXW8zsIvXyRrVSIJloHU29/Fi/NPdScAGy4CNhL/fIcjVcdet9QhZVTNzLuZT0oDWbGQOwigmpImPMAUo986QTmE+YUN+27Z02kQpSacriIYfuCUfY+CKed/V9LJLRsxSPR+KS1UtIyTsDpeJ6S/ZXSnNKUFV54PDsEl9XgtQXExbk74CT7q0uk51F8Q65vEKoLP0Vs9U2mk2oSvW/zYWecRydwbN+cUs5GmSukwevzkgARz/99WHu4RtQSwMECgAAAAAAKXoiXQAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMEFAAAAAgAKXoiXbmBRHGwAAAAKgEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4J1TRN5pWgaEUJMuCKkrKgeIEjeNaB5KwqO3JwMDIAZG278/y233sDO5YUzGOwZNVQNBJ70yTjM4D8f1DkjKwikxe4cMFkzQ8VV7wlnkspMmExIpiEsMppzDntIkJ7QiVT6gK5PRRytyKaOmQciL0Eg3db2l8d0A/mGSXjGIvWqADEvAf2w/jkbiwcurRZd/nPhKFFlEjZnB3UdF1atdFRYob+nHi/wJUEsDBAoAAAAAACl6Il0AAAAAAAAAAAAAAAAFAAAAd29yZC9QSwMEFAAAAAgAKXoiXRumyOvFAAAAKQEAABEAAAB3b3JkL2RvY3VtZW50LnhtbG2PwWrDMAyG73sK4XvjbIdRQpIeCnuBbQ+g2moSiCUju0379rMLZTB2+YWQ9P2/+sMtrHAlTYvwYF6b1gCxE7/wNJjvr4/d3kDKyB5XYRrMnZI5jC/91nlxl0CcoRA4ddtg5pxjZ21yMwVMjUTiMjuLBsyl1cluoj6qOEqpGITVvrXtuw24sBkL8iT+XmusolXyeERdQQl9gjwTVAI8rZve1pWq+tD49/qTnLCHiIqTYpyhpHlwzsstX5T+I9hnEPv75PgDUEsBAh4DFAAAAAgAKXoiXclPGrDrAAAArgEAABMAAAAAAAAAAQAAAKSBAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECHgMKAAAAAAApeiJdAAAAAAAAAAAAAAAABgAAAAAAAAAAABAA7UEcAQAAX3JlbHMvUEsBAh4DFAAAAAgAKXoiXbmBRHGwAAAAKgEAAAsAAAAAAAAAAQAAAKSBQAEAAF9yZWxzLy5yZWxzUEsBAh4DCgAAAAAAKXoiXQAAAAAAAAAAAAAAAAUAAAAAAAAAAAAQAO1BGQIAAHdvcmQvUEsBAh4DFAAAAAgAKXoiXRumyOvFAAAAKQEAABEAAAAAAAAAAQAAAKSBPAIAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAAFAAUAIAEAADADAAAAAA=="

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

// a workbook row that reads like a sheet marker must not open one, no matter how its cells were split
test("toTableText reads a marker-looking workbook row as data", () => {
	const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

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
	expect(tableText.length).toBeLessThanOrEqual(MAX_TABLE_CHARS + 100)
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

// the clip runs before llm-guard, so what it keeps is what the scanner is asked to read
test("toClippedTableText keeps the rows the table text could keep and counts the rest", () => {
	const rows = Array.from({ length: MAX_TABLE_ROWS + 40 }, (_, index) => `r${index},value`)
	const clipped = toClippedTableText(["=== sheet: Only ===", "id,name", ...rows].join("\n"))

	// the heading and the column names ride along, and the rows past the budget are only counted
	expect(clipped.serializedText).toContain("=== sheet: Only ===")
	expect(clipped.serializedText).toContain("id,name")
	expect(clipped.skippedRows).toBe(40)
	expect(clipped.serializedText).toContain(`r${MAX_TABLE_ROWS - 1},value`)
	expect(clipped.serializedText).not.toContain(`r${MAX_TABLE_ROWS},value`)
})

// a workbook of many small sheets would otherwise spend the whole budget on headings and column names
test("toClippedTableText keeps the same amount however many sheets it is given", () => {
	const toSheets = (sheetCount: number): string =>
		Array.from({ length: sheetCount }, (_, index) =>
			[`=== sheet: Sheet${index} ===`, "column".repeat(60), "a,b"].join("\n"),
		).join("\n")

	// what the scanner is asked to read is bounded by the budget, not by the size of the file
	const keptFromFewer = toClippedTableText(toSheets(400)).serializedText
	const keptFromMore = toClippedTableText(toSheets(800)).serializedText
	expect(keptFromMore).toBe(keptFromFewer)
	expect(keptFromFewer.length).toBeLessThan(MAX_TABLE_CHARS * 2 + 500)
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

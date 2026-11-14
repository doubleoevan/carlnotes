// workbook table text tests: a small workbook's table text is the text the whole-file reader wrote, and a workbook
// read as a stream keeps the same rows and names the same count of rows left out
import { expect, test } from "bun:test"
import { XLSX_TYPE } from "@carlnotes/contracts/attachmentTypes"
import { MAX_TABLE_ROWS, toTableText, toWorkbookTableText } from "./attachTable"
import { toRowsWorkbookBytes, toWorkbookFixtureBytes } from "./attachTestFixtures"
import { MAX_WHOLE_WORKBOOK_UNPACKED_BYTES, readWholeWorkbookLines } from "./attachWorkbook"
import { readZipEntries } from "./attachZip"

// how many rows the large workbook has, its header row included
const LARGE_WORKBOOK_ROW_COUNT = 9_000

// two non-empty sheets with fewer rows than the limit keep every row under a heading each, with nothing left out
test("a small workbook's table text is the text the whole-file reader wrote", async () => {
	const { tableText, charCount } = await toWorkbookTableText(await toWorkbookFixtureBytes(), "tracker.xlsx")
	expect(tableText).toBe(
		[
			'[file "tracker.xlsx", sheet "Submissions": 1 rows, columns: Agency, Agent, Sent]',
			"Agency,Agent,Sent",
			"Writers House,Amy Berkower,2026-08-04",
			'[file "tracker.xlsx", sheet "Notes": 1 rows, columns: Note]',
			"Note",
			"Follow up in september",
		].join("\n"),
	)

	// the whole text's length, which the attachment records as its character count
	expect(charCount).toBe(131)
})

// a workbook past the size read whole is read as a stream, which keeps the rows the whole-file reader's text keeps
test("a large workbook's table text keeps the limit of rows and names the rows left out", async () => {
	// the workbook declares more unpacked bytes than a workbook read whole may
	const workbookBytes = await toRowsWorkbookBytes(LARGE_WORKBOOK_ROW_COUNT)
	const unpackedByteSize = readZipEntries(workbookBytes).reduce((sum, zipEntry) => sum + zipEntry.unpackedByteSize, 0)
	expect(unpackedByteSize).toBeGreaterThan(MAX_WHOLE_WORKBOOK_UNPACKED_BYTES)

	// the table text, read as a stream
	const { tableText, charCount } = await toWorkbookTableText(workbookBytes, "queries.xlsx")
	const tableLines = tableText.split("\n")
	const dataRowCount = LARGE_WORKBOOK_ROW_COUNT - 1

	// it has its heading, its header row, the limit of data rows, and the line naming the rest
	expect(tableLines[0]).toStartWith(`[file "queries.xlsx", sheet "Queries": ${dataRowCount} rows, columns: column 0,`)
	expect(tableLines.length).toBe(MAX_TABLE_ROWS + 3)
	expect(tableLines.at(-1)).toBe(`[${dataRowCount - MAX_TABLE_ROWS} rows omitted]`)

	// it is the table text of the whole-file reader's lines, with the same whole length
	const wholeLines: string[] = []
	await readWholeWorkbookLines(workbookBytes, (line) => wholeLines.push(line))
	const serializedText = wholeLines.join("\n")
	expect(tableText).toBe(toTableText({ serializedText, filename: "queries.xlsx", contentType: XLSX_TYPE }))
	expect(charCount).toBe(serializedText.length)
})

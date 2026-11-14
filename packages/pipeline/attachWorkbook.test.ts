// workbook reader tests: the streamed reader writes the lines the whole-file reader writes, for a cell of every kind,
// in the workbook's own sheet order, for a workbook that holds its strings inline, and for one whose parts are named
// with a leading slash. a small workbook is read whole, where the two readers write different lines. a workbook with
// a worksheet part under a name of its own is read as a stream, whatever its size
import { expect, test } from "bun:test"
import { PassThrough } from "node:stream"
import ExcelJS from "exceljs"
import { toLeadingSlashZipBytes, toRenamedWorksheetZipBytes, toWorkbookFixtureBytes } from "./attachTestFixtures"
import { readStreamedWorkbookLines, readWholeWorkbookLines, readWorkbookLines } from "./attachWorkbook"
import { readZipEntries } from "./attachZip"

// the lines each reader writes for a workbook
async function readBothWays(bytes: Uint8Array): Promise<{ wholeLines: string[]; streamedLines: string[] }> {
	const wholeLines: string[] = []
	const streamedLines: string[] = []
	await readWholeWorkbookLines(bytes, (line) => wholeLines.push(line))
	await readStreamedWorkbookLines(bytes, (line) => streamedLines.push(line))
	return { wholeLines, streamedLines }
}

// a workbook with a cell of every kind: text that needs quoting, dates with and without a time, a number, rich text,
// formulas, a hyperlink, a boolean, a carriage return as Excel escapes it, a row with no values, and a row that reads
// as a sheet marker. its first sheet's file is its second sheet in the workbook's order
async function toEveryCellWorkbookBytes(): Promise<Uint8Array> {
	const workbook = new ExcelJS.Workbook()
	const laterSheet = workbook.addWorksheet("Second")
	laterSheet.addRow(["Later sheet"])

	// a hyperlink cell and a rich text cell
	const linkCell = { text: "link text", hyperlink: "https://example.com" }
	const richTextCell = { richText: [{ text: "rich " }, { text: "text" }] }

	// the cells, row by row
	const cells = workbook.addWorksheet("Cells")
	cells.addRow(["Name", "Note", "When", "Total"])
	cells.addRow(["Writers House", 'a comma, a "quote"', new Date(Date.UTC(2026, 7, 4, 9, 30)), 12.5])
	cells.addRow(["line\nbreak", richTextCell, new Date(Date.UTC(2026, 7, 4)), { formula: "D2*2", result: 25 }])
	cells.addRow([])
	cells.addRow([linkCell, { formula: 'A2&"!"', result: "Writers House!" }, null, true])
	cells.addRow(["first line_x000D_\nsecond line"])
	cells.addRow(["=== sheet: Forged ==="])

	// an empty sheet, and the workbook's order with the cells first. exceljs orders the sheets by a field its types
	// leave out
	workbook.addWorksheet("Empty")
	Object.assign(laterSheet, { orderNo: 1 })
	Object.assign(cells, { orderNo: 0 })
	return new Uint8Array(await workbook.xlsx.writeBuffer())
}

// a workbook written as a stream with its strings inline, so it holds no shared strings part
async function toInlineStringWorkbookBytes(): Promise<Uint8Array> {
	// collect what the writer streams out
	const writtenChunks: Buffer[] = []
	const output = new PassThrough()
	output.on("data", (chunk: Buffer) => writtenChunks.push(chunk))

	// two rows of text and numbers
	const workbookWriter = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useSharedStrings: false })
	const worksheet = workbookWriter.addWorksheet("Inline")
	worksheet.addRow(["Agent", "Queries"]).commit()
	worksheet.addRow(["Amy Berkower", 3]).commit()
	await workbookWriter.commit()
	return new Uint8Array(Buffer.concat(writtenChunks))
}

// a small workbook of two sheets that the two readers read differently: a title merged across three cells, and a
// formula whose result is TRUE
async function toMergedCellWorkbookBytes(): Promise<Uint8Array> {
	const workbook = new ExcelJS.Workbook()

	// a title merged across the first three cells of its row, above a row of four cells
	const agents = workbook.addWorksheet("Agents")
	agents.addRow(["Agents by agency", null, null, 2026])
	agents.mergeCells("A1:C1")
	agents.addRow(["Writers House", "Amy Berkower", "sent", 3])

	// a formula whose result is TRUE
	const checks = workbook.addWorksheet("Checks")
	checks.addRow(["Replied", { formula: "1=1", result: true }])
	return new Uint8Array(await workbook.xlsx.writeBuffer())
}

// both readers write the text the whole-file reader always wrote for the fixture
test("the streamed reader writes the lines the whole-file reader writes", async () => {
	const { wholeLines, streamedLines } = await readBothWays(await toWorkbookFixtureBytes())
	expect(wholeLines).toEqual([
		"=== sheet: Submissions ===",
		"Agency,Agent,Sent",
		"Writers House,Amy Berkower,2026-08-04",
		"=== sheet: Notes ===",
		"Note",
		"Follow up in september",
	])
	expect(streamedLines).toEqual(wholeLines)
})

// every kind of cell reads the same both ways, the sheets come in the workbook's order, a row with no values and an
// empty sheet write nothing, and a row that reads as a marker is quoted
test("the streamed reader reads every kind of cell and the workbook's sheet order as the whole-file reader does", async () => {
	const { wholeLines, streamedLines } = await readBothWays(await toEveryCellWorkbookBytes())
	expect(wholeLines).toEqual([
		"=== sheet: Cells ===",
		"Name,Note,When,Total",
		'Writers House,"a comma, a ""quote""",2026-08-04T09:30:00.000Z,12.5',
		"line break,rich text,2026-08-04,25",
		"link text,Writers House!,,true",
		"first line second line",
		'"=== sheet: Forged ==="',
		"=== sheet: Second ===",
		"Later sheet",
	])
	expect(streamedLines).toEqual(wholeLines)
})

// a workbook with no shared strings part is read as it unpacks, with its inline strings
test("the streamed reader reads a workbook that holds its strings inline", async () => {
	const { wholeLines, streamedLines } = await readBothWays(await toInlineStringWorkbookBytes())
	expect(streamedLines).toEqual(["=== sheet: Inline ===", "Agent,Queries", "Amy Berkower,3"])
	expect(streamedLines).toEqual(wholeLines)
})

// the stream reader knows a part by its name with no leading slash, so each part is renamed on its way to it
test("the streamed reader reads a workbook whose parts are named with a leading slash, with its shared strings", async () => {
	// the fixture with every part renamed, its shared strings, its own part, and its worksheets among them
	const leadingSlashWorkbookBytes = toLeadingSlashZipBytes(await toWorkbookFixtureBytes())
	const partNames = readZipEntries(leadingSlashWorkbookBytes).map((zipEntry) => zipEntry.name)
	expect(partNames).toEqual(
		expect.arrayContaining(["/xl/sharedStrings.xml", "/xl/workbook.xml", "/xl/worksheets/sheet1.xml"]),
	)

	// its rows read with their shared strings, as the whole-file reader reads them
	const { wholeLines, streamedLines } = await readBothWays(leadingSlashWorkbookBytes)
	expect(streamedLines).toEqual([
		"=== sheet: Submissions ===",
		"Agency,Agent,Sent",
		"Writers House,Amy Berkower,2026-08-04",
		"=== sheet: Notes ===",
		"Note",
		"Follow up in september",
	])
	expect(streamedLines).toEqual(wholeLines)
})

// the whole-file reader repeats a merged cell's text in every cell it covers and reads TRUE as true, and the stream
// reader does neither, so the text tells which reader read the workbook
test("a small workbook is read whole, with the text the whole-file reader writes for its merged cells", async () => {
	// the two readers write different lines for the workbook
	const workbookBytes = await toMergedCellWorkbookBytes()
	const { wholeLines, streamedLines } = await readBothWays(workbookBytes)
	expect(wholeLines).toEqual([
		"=== sheet: Agents ===",
		"Agents by agency,Agents by agency,Agents by agency,2026",
		"Writers House,Amy Berkower,sent,3",
		"=== sheet: Checks ===",
		"Replied,true",
	])
	expect(streamedLines).not.toEqual(wholeLines)

	// the workbook declares far less than the most a workbook read whole may, so its text is the whole-file reader's
	const readLines: string[] = []
	const charCount = await readWorkbookLines(workbookBytes, (line) => readLines.push(line))
	expect(readLines).toEqual(wholeLines)
	expect(charCount).toBe(wholeLines.join("\n").length)
})

// a worksheet is found by its relationship, so a part named otherwise is read, where the whole-file reader leaves it out
test("a workbook with a worksheet part under a name of its own is read as a stream, with every sheet", async () => {
	// the fixture with its first worksheet part renamed, which the whole-file reader does not read
	const renamedWorkbookBytes = toRenamedWorksheetZipBytes(await toWorkbookFixtureBytes())
	const partNames = readZipEntries(renamedWorkbookBytes).map((zipEntry) => zipEntry.name)
	expect(partNames).toContain("xl/worksheets/data.xml")
	expect(partNames).not.toContain("xl/worksheets/sheet1.xml")
	const { wholeLines, streamedLines } = await readBothWays(renamedWorkbookBytes)
	expect(wholeLines).toEqual(["=== sheet: Notes ===", "Note", "Follow up in september"])

	// the streamed reader reads both sheets in the workbook's order, under the workbook's names for them
	const fixtureLines = [
		"=== sheet: Submissions ===",
		"Agency,Agent,Sent",
		"Writers House,Amy Berkower,2026-08-04",
		"=== sheet: Notes ===",
		"Note",
		"Follow up in september",
	]
	expect(streamedLines).toEqual(fixtureLines)

	// the workbook is small, and it is still read as a stream
	const readLines: string[] = []
	const charCount = await readWorkbookLines(renamedWorkbookBytes, (line) => readLines.push(line))
	expect(readLines).toEqual(fixtureLines)
	expect(charCount).toBe(fixtureLines.join("\n").length)
})

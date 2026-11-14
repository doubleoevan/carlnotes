// a workbook's rows as lines of text: a marker line before each sheet that has rows, then each row as comma-joined
// cells. a small workbook is read whole, and a larger one as a stream that holds one row at a time. a workbook whose
// worksheet parts the whole-file reader does not know by name is read as a stream too
import { Readable } from "node:stream"
import type { Row } from "exceljs"
import { readZipEntries, toStoredZipRecord, toZipEntryRecord, type ZipEntry } from "./attachZip"

// the line that starts each sheet's rows in a workbook's text
export const SHEET_MARKER_PATTERN = /^=== sheet: (.*) ===$/

// the most unpacked bytes a workbook may declare and still be read whole. the whole-file reader holds about 30 bytes
// for each unpacked byte, so a workbook this size reads within 200 MB
export const MAX_WHOLE_WORKBOOK_UNPACKED_BYTES = 4 * 1024 * 1024

// a workbook's text held up to a limit, and how many characters its whole text runs
export type WorkbookText = { text: string; charCount: number }

/**
 * Returns a workbook's text, held until it passes maxChars, with the length of the whole text. The rows past maxChars
 * are counted and never held.
 */
export async function toWorkbookText(bytes: Uint8Array, maxChars: number): Promise<WorkbookText> {
	// the lines held, and their length with a line break after each
	const uncheckedLines: string[] = []
	let uncheckedCharCount = 0

	// hold each line until the held text passes the limit, and count the rest
	const charCount = await readWorkbookLines(bytes, (line) => {
		if (uncheckedCharCount <= maxChars) {
			uncheckedLines.push(line)
			uncheckedCharCount += line.length + 1
		}
	})
	return { text: uncheckedLines.join("\n"), charCount }
}

/**
 * Reads a workbook's rows in order, passes each line of its text to onLine, and returns how many characters the whole
 * text runs. A workbook that declares little unpacked data is read whole, and a larger one as a stream, as is a
 * workbook with a worksheet part under a name the whole-file reader does not know. Rejects a file whose zip directory
 * cannot be read or declares too large an unpacked size, before the workbook is opened.
 */
export async function readWorkbookLines(bytes: Uint8Array, onLine: (line: string) => void): Promise<number> {
	// the unpacked size the zip's directory declares, with no entry unpacked
	let unpackedByteSize = 0
	for (const zipEntry of readZipEntries(bytes)) {
		unpackedByteSize += zipEntry.unpackedByteSize
	}

	// count each line with a line break after it, on its way to the caller
	let joinedCharCount = 0
	const countLine = (line: string): void => {
		joinedCharCount += line.length + 1
		onLine(line)
	}

	// read with the reader that fits the size. the whole-file reader leaves out a worksheet part it does not know by
	// name, so a small workbook with one is read as a stream. the last line is followed by no line break
	const isSmall = unpackedByteSize <= MAX_WHOLE_WORKBOOK_UNPACKED_BYTES
	const isReadWhole = isSmall && (await isEveryWorksheetPartKnownByName(bytes))
	await (isReadWhole ? readWholeWorkbookLines(bytes, countLine) : readStreamedWorkbookLines(bytes, countLine))
	return Math.max(0, joinedCharCount - 1)
}

/**
 * Reads a workbook whole and passes each line of its text to onLine. The memory it takes grows with the workbook's
 * rows.
 */
export async function readWholeWorkbookLines(bytes: Uint8Array, onLine: (line: string) => void): Promise<void> {
	// the parser loads lazily
	const { default: ExcelJS } = await import("exceljs")
	const workbook = new ExcelJS.Workbook()

	// exceljs pins an older Buffer type, so the cast matches whatever its loader declares
	const workbookBytes = Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]
	await workbook.xlsx.load(workbookBytes)

	// exceljs resolves shared strings and turns date serials into dates. a sheet with no rows, like a chart page,
	// writes no marker
	for (const worksheet of workbook.worksheets) {
		const writeSheetLine = toSheetLineWriter(worksheet.name, onLine)
		worksheet.eachRow((worksheetRow) => writeSheetLine(toRowLine(worksheetRow)))
	}
}

/**
 * Reads a workbook as a stream and passes each line of its text to onLine, holding one row at a time, so the memory it
 * takes does not grow with the workbook's rows. The sheets are read in the workbook's own order.
 */
export async function readStreamedWorkbookLines(bytes: Uint8Array, onLine: (line: string) => void): Promise<void> {
	const zipEntriesByName = toZipEntriesByName(bytes)
	const worksheetParts = await readWorksheetParts(bytes, zipEntriesByName)
	if (worksheetParts.length === 0) {
		return
	}

	// the stream reader takes the styles and the shared strings before the worksheets, so every row is read as its
	// worksheet unpacks and none waits on disk for a later part
	const { default: ExcelJS } = await import("exceljs")
	const workbookRecords = toWorkbookRecords({ bytes, zipEntriesByName, worksheetParts })
	const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(workbookRecords), {
		...WORKBOOK_PARTS_OPTIONS,
		worksheets: "emit",
		sharedStrings: "cache",
		styles: "cache",
	})

	// the reader returns the worksheets in the order it was given them
	let worksheetIndex = 0
	for await (const worksheetReader of workbookReader) {
		const writeSheetLine = toSheetLineWriter(worksheetParts[worksheetIndex++]?.name ?? "", onLine)

		// a row with no values writes no line, as the whole-file reader skips it
		for await (const worksheetRow of worksheetReader) {
			if (worksheetRow.hasValues) {
				writeSheetLine(toRowLine(worksheetRow, toStreamedCellText))
			}
		}
	}
}

// the stream reader's options that read a workbook's own parts and nothing else
const WORKBOOK_PARTS_OPTIONS = {
	worksheets: "ignore",
	sharedStrings: "ignore",
	styles: "ignore",
	hyperlinks: "ignore",
	entries: "ignore",
} as const

// the workbook's own part, its relationships, its styles, and its shared strings, by the names the readers know
const WORKBOOK_PART_NAME = "xl/workbook.xml"
const WORKBOOK_RELATIONSHIPS_PART_NAME = "xl/_rels/workbook.xml.rels"
const STYLES_PART_NAME = "xl/styles.xml"
const SHARED_STRINGS_PART_NAME = "xl/sharedStrings.xml"

// a shared strings part with no strings, for a workbook that has none
const EMPTY_SHARED_STRINGS_XML = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>'

// the name exceljs knows a worksheet part by. its whole-file reader leaves out a worksheet part under any other name,
// and its stream reader never reads one
const WORKSHEET_PART_PATTERN = /xl\/worksheets\/sheet\d+[.]xml/

// what the type of a relationship that names a worksheet part ends with. a chart sheet's type ends otherwise
const WORKSHEET_RELATIONSHIP_TYPE_END = "/relationships/worksheet"

// a worksheet to read: the name the workbook gives it, and its entry in the zip
type WorksheetPart = { name: string; zipEntry: ZipEntry }

// what the stream reader holds once it has read a workbook's own part and its relationships: the sheets in the
// workbook's order, and the part each relationship names
type WorkbookParts = {
	model?: { sheets?: { name: string; rId: string }[] }
	workbookRels?: { Id: string; Type?: string; Target: string }[]
}

// a workbook's parts by name, each renamed with no leading slash, the name the stream reader knows a part by. a part
// written to it under any other name is unpacked to a file on disk and never read
function toZipEntriesByName(bytes: Uint8Array): Map<string, ZipEntry> {
	return new Map(
		readZipEntries(bytes).map((zipEntry) => {
			const partName = zipEntry.name.replace(/^\//, "")
			return [partName, { ...zipEntry, name: partName }]
		}),
	)
}

// whether every worksheet the workbook names is a part under a name the whole-file reader knows
async function isEveryWorksheetPartKnownByName(bytes: Uint8Array): Promise<boolean> {
	const worksheetParts = await readWorksheetParts(bytes, toZipEntriesByName(bytes))
	return worksheetParts.every(({ zipEntry }) => WORKSHEET_PART_PATTERN.test(zipEntry.name))
}

// a writer of one sheet's lines, which writes the sheet's marker before its first row
function toSheetLineWriter(sheetName: string, onLine: (line: string) => void): (rowLine: string) => void {
	// a sheet's name may hold a line break, and each line of the marker is written on its own
	let markerLines: string[] | null = `=== sheet: ${sheetName} ===`.split("\n")
	return (rowLine) => {
		markerLines?.forEach(onLine)
		markerLines = null
		onLine(rowLine)
	}
}

// one row as a line: its cells up to the last one, each read as text and comma-joined
function toRowLine(worksheetRow: Row, readCellText: (cellValue: unknown) => string = toCellText): string {
	const worksheetCells: string[] = []
	worksheetRow.eachCell({ includeEmpty: true }, (cell) => worksheetCells.push(toCsvField(readCellText(cell.value))))
	return toSheetSafeRow(worksheetCells.join(","))
}

// a character Excel writes as its code, in four hex digits between _x and _, like a carriage return in a cell's text
const ESCAPED_CHARACTER_PATTERN = /_x([0-9A-F]{4})_/g

// one cell the stream reader read as text. the stream reader leaves an escaped character as Excel wrote it, and this
// puts the character back, as the whole-file reader does
function toStreamedCellText(cellValue: unknown): string {
	return toCellText(cellValue).replace(ESCAPED_CHARACTER_PATTERN, (_escapedCharacter, hexCode: string) =>
		String.fromCharCode(Number.parseInt(hexCode, 16)),
	)
}

// one cell as text, whichever shape exceljs returns
function toCellText(cellValue: unknown): string {
	if (cellValue === null || cellValue === undefined) {
		return ""
	}

	// a date cell keeps its time only if it has one
	if (cellValue instanceof Date) {
		const hasTime = cellValue.getUTCHours() + cellValue.getUTCMinutes() + cellValue.getUTCSeconds() > 0
		return hasTime ? cellValue.toISOString() : cellValue.toISOString().slice(0, 10)
	}

	// rich text joins its runs, a formula reads as its result, and a hyperlink reads as its text
	if (typeof cellValue === "object") {
		const cell = cellValue as { result?: unknown; text?: unknown; richText?: { text: string }[] }
		if (cell.richText) {
			return cell.richText.map((part) => part.text).join("")
		}
		if (cell.result !== undefined) {
			return toFormulaResultText(cell.result)
		}

		// a hyperlink's text, or nothing for a shape with no words in it
		return cell.text !== undefined ? toCellText(cell.text) : ""
	}
	return String(cellValue)
}

// a formula's result as text. the stream reader returns a formula's error as a result that is not a number, which
// reads as empty, as the whole-file reader's error does
function toFormulaResultText(formulaResult: unknown): string {
	return typeof formulaResult === "number" && Number.isNaN(formulaResult) ? "" : toCellText(formulaResult)
}

// a cell as one csv field: line breaks flatten, and a comma or quote takes standard csv quoting,
// so no cell can split its row or start a line that reads as a sheet marker
function toCsvField(cellText: string): string {
	const flattenedCell = cellText.replace(/\r?\n/g, " ")
	if (flattenedCell.includes(",") || flattenedCell.includes('"')) {
		return `"${flattenedCell.replaceAll('"', '""')}"`
	}
	return flattenedCell
}

// a row that reads as a sheet marker is quoted whole. cells that each pass on their own still join into one line,
// so the finished row is what has to be checked
function toSheetSafeRow(rowLine: string): string {
	return SHEET_MARKER_PATTERN.test(rowLine) ? `"${rowLine.replaceAll('"', '""')}"` : rowLine
}

// the worksheets a workbook names, in the order its own part lists them, as the whole-file reader orders them
async function readWorksheetParts(
	bytes: Uint8Array,
	zipEntriesByName: Map<string, ZipEntry>,
): Promise<WorksheetPart[]> {
	// a workbook without its own part or its relationships names no worksheet
	const workbookEntry = zipEntriesByName.get(WORKBOOK_PART_NAME)
	const relationshipsEntry = zipEntriesByName.get(WORKBOOK_RELATIONSHIPS_PART_NAME)
	if (!workbookEntry || !relationshipsEntry) {
		return []
	}

	// read the two parts through the stream reader
	const { default: ExcelJS } = await import("exceljs")
	const partRecords = [...toZipEntryRecord(bytes, workbookEntry), ...toZipEntryRecord(bytes, relationshipsEntry)]
	const partsReader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(partRecords), WORKBOOK_PARTS_OPTIONS)
	await partsReader.read()
	const { model, workbookRels = [] } = partsReader as unknown as WorkbookParts

	// each sheet's relationship names its part, which is a worksheet if the relationship's type says so, whatever
	// the part's name
	const worksheetParts: WorksheetPart[] = []
	for (const sheet of model?.sheets ?? []) {
		const relationship = workbookRels.find((workbookRel) => workbookRel.Id === sheet.rId)
		const isWorksheet = relationship?.Type?.endsWith(WORKSHEET_RELATIONSHIP_TYPE_END)
		const partName = `xl/${relationship?.Target.replace(/^(\s|\/xl\/)+/, "")}`
		const zipEntry = isWorksheet ? zipEntriesByName.get(partName) : undefined

		// a sheet of any other kind, like a chart sheet, is left out
		if (zipEntry) {
			worksheetParts.push({ name: sheet.name, zipEntry })
		}
	}
	return worksheetParts
}

// a workbook's bytes, its zip entries by name, and the worksheets to read
type ToWorkbookRecordsOptions = {
	bytes: Uint8Array
	zipEntriesByName: Map<string, ZipEntry>
	worksheetParts: WorksheetPart[]
}

// the records the stream reader reads, in the order it needs them: the workbook's own part, its relationships, its
// styles, its shared strings, then each worksheet
function* toWorkbookRecords({
	bytes,
	zipEntriesByName,
	worksheetParts,
}: ToWorkbookRecordsOptions): Generator<Uint8Array> {
	for (const partName of [WORKBOOK_PART_NAME, WORKBOOK_RELATIONSHIPS_PART_NAME, STYLES_PART_NAME]) {
		const zipEntry = zipEntriesByName.get(partName)
		if (zipEntry) {
			yield* toZipEntryRecord(bytes, zipEntry)
		}
	}

	// the stream reader reads a worksheet as it unpacks only once it has read shared strings, so a workbook without
	// any is given an empty part
	const sharedStringsEntry = zipEntriesByName.get(SHARED_STRINGS_PART_NAME)
	yield* sharedStringsEntry
		? toZipEntryRecord(bytes, sharedStringsEntry)
		: toStoredZipRecord(SHARED_STRINGS_PART_NAME, new TextEncoder().encode(EMPTY_SHARED_STRINGS_XML))

	// the worksheets in the workbook's order, each under the name the stream reader reads a worksheet by, numbered
	// by its place in that order
	for (const [worksheetIndex, { zipEntry }] of worksheetParts.entries()) {
		yield* toZipEntryRecord(bytes, { ...zipEntry, name: `xl/worksheets/sheet${worksheetIndex + 1}.xml` })
	}
}

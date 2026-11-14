// a table file's text: its sheets laid out for the model as headed rows, clipped to the limits, with a line naming
// the rows left out
import { toBaseContentType, XLSX_TYPE } from "@carlnotes/contracts/attachmentTypes"
import { MAX_ATTACHMENT_CONTEXT_CHARS } from "@carlnotes/contracts/topics"
import { readWorkbookLines, SHEET_MARKER_PATTERN } from "./attachWorkbook"

// the most rows table text keeps, shared across a workbook's sheets
export const MAX_TABLE_ROWS = 150

// the most characters that the rows and headings of table text keep.
// the attachment context limit also holds the omitted-rows line, so an owner can save an edit to a full table's text
const OMITTED_ROWS_LINE_CHARS = 32

export const MAX_TABLE_CHARS = MAX_ATTACHMENT_CONTEXT_CHARS - OMITTED_ROWS_LINE_CHARS

// what to write out: the extracted table text, the file it came from, and the type that says whether it is a workbook
export type TableTextOptions = {
	serializedText: string
	filename: string
	contentType: string
}

// a workbook's table text, and how many characters the workbook's whole text runs
export type WorkbookTableText = { tableText: string; charCount: number }

/**
 * Writes extracted table text into headed sheets of verbatim rows, with a line naming what was left out.
 */
export function toTableText({ serializedText, filename, contentType }: TableTextOptions): string {
	const tableTextWriter = toTableTextWriter(filename, toBaseContentType(contentType) === XLSX_TYPE)
	for (const line of serializedText.split("\n")) {
		addTableLine(tableTextWriter, line)
	}
	return toWrittenTableText(tableTextWriter)
}

/**
 * Reads a workbook and writes its table text as toTableText writes it, holding only the rows the table text keeps.
 * Returns the table text with the length of the workbook's whole text.
 */
export async function toWorkbookTableText(bytes: Uint8Array, filename: string): Promise<WorkbookTableText> {
	const tableTextWriter = toTableTextWriter(filename, true)
	const charCount = await readWorkbookLines(bytes, (line) => addTableLine(tableTextWriter, line))
	return { tableText: toWrittenTableText(tableTextWriter), charCount }
}

// what table text has spent so far of the row and character budgets its sheets share
type TableTextUsage = { rowsUsed: number; charsUsed: number }

// table text being written one line at a time: the file it is for, whether its lines mark sheets as a workbook's do,
// the lines of the sheets that ended, what those sheets spent of the shared budgets, how many rows they left out, and
// the sheet whose lines are arriving
type TableTextWriter = {
	filename: string
	isWorkbook: boolean
	tableLines: string[]
	usage: TableTextUsage
	omittedRowCount: number
	openSheet: OpenSheet | null
}

// the sheet whose lines are arriving: its name, its header row and column list once a line with content arrives, how
// many data rows it has so far, and its budget for each number of digits its row count may have
type OpenSheet = {
	name: string | null
	headerRow: string | null
	columnList: string
	dataRowCount: number
	sheetBudgets: SheetBudget[]
}

// what a sheet keeps if its row count has a given number of digits: whether its heading fits at all, what the shared
// budgets have spent once its kept rows are added, and those rows
type SheetBudget = { isSheetKept: boolean; usage: TableTextUsage; keptRows: string[] }

// the most digits a sheet's row count is budgeted for, which a count under a billion rows has
const MAX_ROW_COUNT_DIGITS = 9

// a writer with nothing written yet
function toTableTextWriter(filename: string, isWorkbook: boolean): TableTextWriter {
	return {
		filename,
		isWorkbook,
		tableLines: [],
		usage: { rowsUsed: 0, charsUsed: 0 },
		omittedRowCount: 0,
		openSheet: null,
	}
}

// add one line of a table's text. only a workbook's text marks its sheets, so a csv upload is one unnamed sheet, and
// its own lines never read as a marker
function addTableLine(tableTextWriter: TableTextWriter, line: string): void {
	// a marker ends the open sheet and starts the one it names
	const marker = tableTextWriter.isWorkbook ? SHEET_MARKER_PATTERN.exec(line) : null
	if (marker) {
		closeOpenSheet(tableTextWriter)
		tableTextWriter.openSheet = toOpenSheet(marker[1] ?? "")
		return
	}

	// any other line joins the open sheet or starts the unnamed one. a blank line holds no row
	tableTextWriter.openSheet ??= toOpenSheet(null)
	if (!line.trim()) {
		return
	}

	// a sheet's first line with content is its header row, and every later one is a data row
	if (tableTextWriter.openSheet.headerRow === null) {
		startSheetRows(tableTextWriter, tableTextWriter.openSheet, line)
		return
	}
	addDataRow(tableTextWriter.openSheet, line)
}

// a sheet with no line yet
function toOpenSheet(name: string | null): OpenSheet {
	return { name, headerRow: null, columnList: "", dataRowCount: 0, sheetBudgets: [] }
}

// take a sheet's header row, and budget the sheet's rows. the heading names how many rows the sheet has, which is
// known only once its last row arrives, and a longer count leaves less room for rows. so the rows are budgeted once
// for each number of digits the count may have, and the sheet's end picks the budget for the digits its count has
function startSheetRows(tableTextWriter: TableTextWriter, openSheet: OpenSheet, headerRow: string): void {
	openSheet.headerRow = headerRow
	openSheet.columnList = toColumnList(headerRow)

	// a sheet arriving after the budgets are spent has no budget, so its rows are counted and none is kept
	const { usage } = tableTextWriter
	if (usage.rowsUsed >= MAX_TABLE_ROWS || usage.charsUsed >= MAX_TABLE_CHARS) {
		return
	}

	// a heading and header that would cross the budget on their own leave the whole sheet out. one very wide header
	// would otherwise spend the budget the check never sees
	const countlessHeadingLine = toSheetHeadingLine(tableTextWriter.filename, openSheet, "")
	for (let digitCount = 1; digitCount <= MAX_ROW_COUNT_DIGITS; digitCount++) {
		const headingChars = countlessHeadingLine.length + digitCount + headerRow.length + 2
		const isSheetKept = usage.charsUsed + headingChars <= MAX_TABLE_CHARS
		const charsUsed = usage.charsUsed + (isSheetKept ? headingChars : 0)
		openSheet.sheetBudgets.push({ isSheetKept, usage: { rowsUsed: usage.rowsUsed, charsUsed }, keptRows: [] })
	}
}

// the line naming the file, sheet, row count, and columns
function toSheetHeadingLine(filename: string, openSheet: OpenSheet, dataRowCountText: string): string {
	const sheetLabel = openSheet.name === null ? `file "${filename}"` : `file "${filename}", sheet "${openSheet.name}"`
	return `[${sheetLabel}: ${dataRowCountText} rows, columns: ${openSheet.columnList}]`
}

// count a data row, and keep it whole in each budget that neither limit would be crossed in
function addDataRow(openSheet: OpenSheet, dataRow: string): void {
	openSheet.dataRowCount += 1
	for (const { isSheetKept, usage, keptRows } of openSheet.sheetBudgets) {
		// a row past either budget is counted instead of kept
		const isRowPastBudget = usage.rowsUsed >= MAX_TABLE_ROWS || usage.charsUsed + dataRow.length + 1 > MAX_TABLE_CHARS
		if (!isSheetKept || isRowPastBudget) {
			continue
		}

		// the row goes in whole, spending both budgets
		keptRows.push(dataRow)
		usage.rowsUsed += 1
		usage.charsUsed += dataRow.length + 1
	}
}

// end the open sheet: write its heading, its header row, and the rows it kept, and count the rows it left out
function closeOpenSheet(tableTextWriter: TableTextWriter): void {
	// no sheet is open, or the open one's lines are all blank, so there is nothing to write
	const { openSheet } = tableTextWriter
	tableTextWriter.openSheet = null
	if (!openSheet || openSheet.headerRow === null) {
		return
	}

	// the budget for the digits the row count has. a sheet with no budget, or whose heading does not fit, is left out
	const dataRowCountText = String(openSheet.dataRowCount)
	const sheetBudget = openSheet.sheetBudgets[dataRowCountText.length - 1] ?? openSheet.sheetBudgets.at(-1)
	if (!sheetBudget?.isSheetKept) {
		tableTextWriter.omittedRowCount += openSheet.dataRowCount
		return
	}

	// the heading, the header row, and the kept rows, with the budgets as those rows left them
	const sheetHeadingLine = toSheetHeadingLine(tableTextWriter.filename, openSheet, dataRowCountText)
	tableTextWriter.tableLines.push(sheetHeadingLine, openSheet.headerRow, ...sheetBudget.keptRows)
	tableTextWriter.usage = sheetBudget.usage
	tableTextWriter.omittedRowCount += openSheet.dataRowCount - sheetBudget.keptRows.length
}

// the table text of every line added, with a line naming how many rows were left out
function toWrittenTableText(tableTextWriter: TableTextWriter): string {
	closeOpenSheet(tableTextWriter)
	const { tableLines, omittedRowCount } = tableTextWriter
	return (omittedRowCount > 0 ? [...tableLines, `[${omittedRowCount} rows omitted]`] : tableLines).join("\n")
}

// how many of a sheet's column names the heading lists before it just counts the rest
const MAX_LISTED_COLUMNS = 20

// the header row's column names, limited so a wide sheet stays readable. a quoted name keeps its commas
function toColumnList(headerRow: string): string {
	const columns = (
		headerRow.includes("\t") ? headerRow.split("\t") : (headerRow.match(/(?:"(?:[^"]|"")*"|[^,])+/g) ?? [])
	).map((column) => column.trim().replace(/^"|"$/g, "").replaceAll('""', '"'))

	// a sheet narrow enough lists every name, and a wider one ends with the count of what it left out
	if (columns.length <= MAX_LISTED_COLUMNS) {
		return columns.join(", ")
	}
	return `${columns.slice(0, MAX_LISTED_COLUMNS).join(", ")}, and ${columns.length - MAX_LISTED_COLUMNS} more`
}

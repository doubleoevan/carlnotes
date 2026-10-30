// a table file's text: its sheets serialized to rows, clipped to the limits, and laid out for the model
import { MAX_ATTACHMENT_CONTEXT_CHARS } from "@carlnotes/contracts/topics"
import { toBaseContentType, XLSX_TYPE } from "./attachContentType"

// the line that starts each Excel sheet's section in a serialized workbook
const SHEET_MARKER_PATTERN = /^=== sheet: (.*) ===$/

/**
 * Serializes an Excel workbook to text: each sheet's rows under a marker line, each row as comma-joined cells.
 */
export async function toSerializedWorkbook(bytes: Uint8Array): Promise<string> {
	// the parser loads lazily
	const { default: ExcelJS } = await import("exceljs")
	const workbook = new ExcelJS.Workbook()

	// exceljs pins an older Buffer type, so the cast matches whatever its loader declares
	const workbookBytes = Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]
	await workbook.xlsx.load(workbookBytes)

	// exceljs resolves shared strings and turns date serials into dates
	const worksheetSections: string[] = []
	for (const worksheet of workbook.worksheets) {
		const worksheetLines: string[] = []
		worksheet.eachRow((worksheetRow) => {
			const worksheetCells: string[] = []
			worksheetRow.eachCell({ includeEmpty: true }, (cell) => worksheetCells.push(toCsvField(toCellText(cell.value))))
			worksheetLines.push(toSheetSafeRow(worksheetCells.join(",")))
		})

		// skip a sheet with no rows, like a chart page
		if (worksheetLines.length > 0) {
			worksheetSections.push(`=== sheet: ${worksheet.name} ===\n${worksheetLines.join("\n")}`)
		}
	}
	return worksheetSections.join("\n")
}

// one cell as text, whichever shape exceljs hands back
function toCellText(value: unknown): string {
	if (value === null || value === undefined) {
		return ""
	}

	// a date cell keeps its time only when it has one
	if (value instanceof Date) {
		const hasTime = value.getUTCHours() + value.getUTCMinutes() + value.getUTCSeconds() > 0
		return hasTime ? value.toISOString() : value.toISOString().slice(0, 10)
	}

	// rich text joins its runs, a formula reads as its result, and a hyperlink reads as its text
	if (typeof value === "object") {
		const cell = value as { result?: unknown; text?: unknown; richText?: { text: string }[] }
		if (cell.richText) {
			return cell.richText.map((part) => part.text).join("")
		}
		if (cell.result !== undefined) {
			return toCellText(cell.result)
		}

		// a hyperlink's text, or nothing for a shape with no words in it
		return cell.text !== undefined ? toCellText(cell.text) : ""
	}
	return String(value)
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

/**
 * Writes extracted table text into headed sheets of verbatim rows, with a line naming what was left out.
 */
export function toTableText({ serializedText, filename, contentType }: TableTextOptions): string {
	// walk every sheet under one shared budget
	const usage: TableTextUsage = { rowsUsed: 0, charsUsed: 0 }
	const tableLines: string[] = []
	let skippedTableRows = 0
	for (const sheet of toParsedSheets(serializedText, contentType)) {
		skippedTableRows += addSheetLines(sheet, filename, usage, tableLines)
	}

	// name what was left out
	if (skippedTableRows > 0) {
		tableLines.push(`[${skippedTableRows} rows omitted]`)
	}
	return tableLines.join("\n")
}

// what table text has spent so far of the row and character budgets its sheets share
type TableTextUsage = { rowsUsed: number; charsUsed: number }

// writes one sheet into the shared lines, spending the shared budget, and returns how many rows it left out
function addSheetLines(
	sheet: { name: string | null; lines: string[] },
	filename: string,
	tableTextUsage: TableTextUsage,
	tableLines: string[],
): number {
	// a sheet whose lines are all blank has nothing to write
	const contentLines = sheet.lines.filter((line) => line.trim())
	if (contentLines.length === 0) {
		return 0
	}

	// a sheet arriving after the budgets are spent counts as omitted instead of starting a header
	const headerRow = contentLines[0] ?? ""
	const dataRows = contentLines.slice(1)
	if (tableTextUsage.rowsUsed >= MAX_TABLE_ROWS || tableTextUsage.charsUsed >= MAX_TABLE_CHARS) {
		return dataRows.length
	}

	// compute the line naming the file, sheet, row count, and columns
	const sheetLabel = sheet.name === null ? `file "${filename}"` : `file "${filename}", sheet "${sheet.name}"`
	const sheetHeadingLine = `[${sheetLabel}: ${dataRows.length} rows, columns: ${toColumnList(headerRow)}]`

	// a heading and header that would cross the budget on their own leave the whole sheet out,
	// since one very wide header would otherwise spend the budget the check never sees
	const headingChars = sheetHeadingLine.length + headerRow.length + 2
	if (tableTextUsage.charsUsed + headingChars > MAX_TABLE_CHARS) {
		return dataRows.length
	}
	tableLines.push(sheetHeadingLine, headerRow)
	tableTextUsage.charsUsed += headingChars

	// keep whole rows until either budget would be crossed
	let omittedRows = 0
	for (const dataRow of dataRows) {
		// a row past either budget is counted instead of kept
		if (tableTextUsage.rowsUsed >= MAX_TABLE_ROWS || tableTextUsage.charsUsed + dataRow.length + 1 > MAX_TABLE_CHARS) {
			omittedRows += 1
			continue
		}

		// the row goes in whole, spending both budgets
		tableLines.push(dataRow)
		tableTextUsage.rowsUsed += 1
		tableTextUsage.charsUsed += dataRow.length + 1
	}
	return omittedRows
}

// splits serialized text into sheets on the workbook markers. only toSerializedWorkbook writes those markers,
// so a csv upload is one unnamed sheet, and its own lines never read as one
function toParsedSheets(serializedText: string, contentType: string): { name: string | null; lines: string[] }[] {
	const isWorkbook = toBaseContentType(contentType) === XLSX_TYPE
	const sheets: { name: string | null; lines: string[] }[] = []
	for (const line of serializedText.split("\n")) {
		// a marker starts a sheet, and any other line joins the open one
		const marker = isWorkbook ? SHEET_MARKER_PATTERN.exec(line) : null
		if (marker) {
			sheets.push({ name: marker[1] ?? "", lines: [] })
			continue
		}

		// any other line joins the open sheet or starts the unnamed one
		if (sheets.length === 0) {
			sheets.push({ name: null, lines: [line] })
		} else {
			sheets[sheets.length - 1]?.lines.push(line)
		}
	}

	// return what was collected, one entry per sheet
	return sheets
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

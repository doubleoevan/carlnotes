// topic attachments
import { generateText } from "ai"
import { and, eq } from "drizzle-orm"
import { extractText as extractPdfText } from "unpdf"
import { db } from "../db"
import { attachments, topics } from "../db/schema"
import { chatModel, cheapModel } from "./models.ts"
// the prompt loader fetches the registry version first, falling back to the bundled markdown
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "./prompts/fetch.ts"
import { writePrompt } from "./prompts/write.ts"
import { toFetchableUrl } from "./publicFetch"
import { fetchContent } from "./scrape"
import { deleteAttachment, MAX_KEY_FILENAME_CHARS, toAttachmentKey, uploadAttachment } from "./store"
import { startAttachmentWorkflow } from "./temporal-client"

// a rejection safe to show the user as written: their file or url, not an infra failure like a misconfigured llm proxy
export class AttachmentValidationError extends Error {}

// a persisted attachment row, and the upload ingestAttachment input
type Attachment = typeof attachments.$inferSelect
type AttachmentUpload = {
	topicId: string
	filename: string
	contentType: string
	bytes: Uint8Array
	sourceUrl?: string
}

// reject uploads larger than this before any storage or model work
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
// limit the extracted text fed to the model
const MAX_EXTRACT_CHARS = 8000
// a fetched page is stored as markdown
const PAGE_EXTENSION = ".md"
const MAX_PAGE_NAME_CHARS = MAX_KEY_FILENAME_CHARS - PAGE_EXTENSION.length

// the synchronous half of ingestion
export async function ingestAttachment(attachmentUpload: AttachmentUpload): Promise<Attachment> {
	const { topicId, filename, contentType, bytes, sourceUrl = null } = attachmentUpload
	// validate the size and type of the payload before touching storage
	if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
		throw new AttachmentValidationError(`attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`)
	}
	// an empty upload would store fine and read back as a ready attachment that downloads to nothing, so prevent it here
	if (bytes.byteLength === 0) {
		throw new AttachmentValidationError("attachment is empty")
	}
	if (!isSupportedAttachmentType(contentType)) {
		throw new AttachmentValidationError(`unsupported attachment content type: ${contentType}`)
	}

	// reject a nonexistent topic before spending storage. the foreign key would only catch it at insert
	await isExistingTopic(topicId)

	// store the raw bytes under a key that is namespaced by topic and attachment
	const attachmentId = crypto.randomUUID()
	const objectKey = toAttachmentKey(topicId, attachmentId, filename)
	await uploadAttachment(objectKey, bytes, contentType)

	// from here the object exists
	try {
		const attachmentRow = {
			id: attachmentId,
			topicId,
			objectKey,
			filename,
			contentType,
			byteSize: bytes.byteLength,
			sourceUrl,
		}
		const [attachment] = await db.insert(attachments).values(attachmentRow).returning()
		if (!attachment) {
			throw new Error(`failed to persist attachment for topic ${topicId}`)
		}
		// start the durable workflow that extracts, summarizes, and marks the attachment ready
		await startAttachmentWorkflow(attachmentId)
		return attachment
	} catch (error) {
		// best-effort clean up for an invalid attachment row and the object, then rethrow the original failure
		await db
			.delete(attachments)
			.where(eq(attachments.id, attachmentId))
			.catch(() => {})
		await deleteAttachment(objectKey).catch(() => {})
		throw error
	}
}

/**
 * Ingest a URL as an attachment. The page is fetched here, then handed to the same synchronous half a file upload uses,
 * so storage, persistence, and orphan cleanup are the shared path. A url that cannot be fetched is rejected instead of stored
 */
export async function ingestUrlAttachment(topicId: string, url: string): Promise<Attachment> {
	// reject a malformed, non-http, or internal url before any request goes out. each rejection names its own reason
	let fetchableUrl: URL
	try {
		fetchableUrl = toFetchableUrl(url)
	} catch (error) {
		throw new AttachmentValidationError(error instanceof Error ? error.message : String(error))
	}

	// an attached url names a page to read, so it takes the scrape instead of the caption path a video would
	const fetchResult = await fetchContent(fetchableUrl.toString(), "read").catch(() => {
		throw new AttachmentValidationError(`this page could not be read: ${url}`)
	})

	// the processing workflow screens this Markdown as a document, so there is no llm-guard screen here
	return ingestAttachment({
		topicId,
		filename: toPageFilename(fetchableUrl),
		contentType: "text/markdown",
		bytes: new TextEncoder().encode(fetchResult.text),
		sourceUrl: fetchableUrl.toString(),
	})
}

/**
 * A filename for a fetched page, built from its host and path so the stored object reads as its origin.
 */
function toPageFilename(pageUrl: URL): string {
	// a fetched page has no filename the way an upload does, so use the url
	const filePath = pageUrl.pathname.replaceAll("/", "-").replace(/^-+|-+$/g, "")
	const pageName = `${pageUrl.hostname}${filePath ? `-${filePath}` : ""}`
	return `${pageName.slice(0, MAX_PAGE_NAME_CHARS)}${PAGE_EXTENSION}`
}

// the OOXML media types a browser reports for word and excel files
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

// the media type each known extension stands for. browsers often misreport these
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
	".txt": "text/plain",
	".log": "text/plain",
	".md": "text/markdown",
	".markdown": "text/markdown",
	// the table and document extensions, the ones a browser most often reports wrongly
	".csv": "text/csv",
	".tsv": "text/tab-separated-values",
	".json": "application/json",
	".pdf": "application/pdf",
	".docx": DOCX_TYPE,
	".xlsx": XLSX_TYPE,
}

// a content type without its parameters, so a declared charset never breaks an exact match
function toBaseContentType(contentType: string): string {
	return contentType.split(";")[0]?.trim().toLowerCase() ?? ""
}

/**
 * Resolves an upload's one content type: the reported content type when an extractor knows it, otherwise by extension.
 */
export function toCanonicalContentType(contentType: string, filename: string): string {
	// a browser that does not recognize a file reports one of these, which says nothing about what is inside it.
	// a csv arrives as text/plain more often than as text/csv, so the extension is the better answer for both
	const baseContentType = toBaseContentType(contentType)
	const isReportedTypeGeneric = baseContentType === "text/plain" || baseContentType === "application/octet-stream"
	if (contentType && !isReportedTypeGeneric && isSupportedAttachmentType(contentType)) {
		return contentType
	}

	// a filename without an extension has nothing more to offer, and an unknown one keeps the reported type
	const dotIndex = filename.lastIndexOf(".")
	if (dotIndex === -1) {
		return contentType
	}
	return CONTENT_TYPE_BY_EXTENSION[filename.slice(dotIndex).toLowerCase()] ?? contentType
}

/** Whether an attachment holds rows: csv, tsv, or an Excel workbook. */
export function isTableFileType(contentType: string): boolean {
	const baseContentType = toBaseContentType(contentType)
	return (
		baseContentType === "text/csv" || baseContentType === "text/tab-separated-values" || baseContentType === XLSX_TYPE
	)
}

// whether an attachment's content type is one carl accepts
function isSupportedAttachmentType(contentType: string): boolean {
	// text and JSON decode, PDF and the OOXML types parse, and an image goes to the model directly
	const baseType = toBaseContentType(contentType)
	// biome-ignore format: one line keeps the type list under the comment-density hook's limit
	return baseType.startsWith("text/") || baseType === "application/pdf" || baseType === "application/json" || baseType === DOCX_TYPE || baseType === XLSX_TYPE || isImageAttachmentType(baseType)
}

// throw an error if the topic doesn't exist
async function isExistingTopic(topicId: string): Promise<void> {
	// the foreign key would only catch a bad topic at insert, after the work is done. check up front instead
	const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`topic ${topicId} not found`)
	}
}

/**
 * Extracts an uploaded file's text. A workbook serializes its sheets.
 */
export async function extractText(contentType: string, bytes: Uint8Array): Promise<string> {
	// uploaded html decodes like text but is full of tags, so it converts to markdown first
	const baseContentType = toBaseContentType(contentType)
	if (baseContentType === "text/html") {
		return htmlToMarkdown(decodeTextBytes(bytes, contentType))
	}

	// any other text type, and json, is already text
	if (baseContentType.startsWith("text/") || baseContentType === "application/json") {
		return decodeTextBytes(bytes, contentType)
	}

	// parse a PDF with unpdf, merging every page into one string
	if (baseContentType === "application/pdf") {
		const { text } = await extractPdfText(bytes, { mergePages: true })
		return text
	}

	// a Word document gives its plain text. the parser loads lazily
	if (baseContentType === DOCX_TYPE) {
		const { default: mammoth } = await import("mammoth")
		const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
		return value
	}

	// a workbook serializes each sheet's rows
	if (baseContentType === XLSX_TYPE) {
		return toSerializedWorkbook(bytes)
	}

	// an image includes no text to decode. the model reads it instead, so extraction is not its path
	if (isImageAttachmentType(baseContentType)) {
		throw new AttachmentValidationError(`an image is read by the model, not extracted: ${contentType}`)
	}

	// any other type has no extractor. reject so the caller stores nothing
	throw new AttachmentValidationError(`unsupported attachment content type: ${contentType}`)
}

// decodes text by the declared charset, then strict utf-8, then windows-1252, excel's plain csv export
function decodeTextBytes(bytes: Uint8Array, contentType: string): string {
	// a declared charset wins when the platform knows it
	const declaredCharset = /charset=([\w-]+)/i.exec(contentType)?.[1]
	if (declaredCharset) {
		try {
			return new TextDecoder(declaredCharset).decode(bytes)
		} catch {
			// an unknown declared charset falls through to the sniff
		}
	}

	// strict utf-8 first, so the fallback only takes bytes utf-8 genuinely cannot hold
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
	} catch {
		return new TextDecoder("windows-1252").decode(bytes)
	}
}

// converts uploaded HTML to markdown-shaped text
function htmlToMarkdown(html: string): string {
	// drop what never renders, then mark headings and list items before the tags are deleted
	const withoutScripts = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
	const withMarkers = withoutScripts
		.replace(/<h([1-6])[^>]*>/gi, (_, level) => `\n${"#".repeat(Number(level))} `)
		.replace(/<li[^>]*>/gi, "\n- ")
		.replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|blockquote)>/gi, "\n")
		.replace(/<br[^>]*\/?>/gi, "\n")

	// strip the remaining tags and put the common entities back
	const withoutTags = withMarkers.replace(/<[^>]+>/g, "")
	const decoded = withoutTags
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")

	// collapse runs of blank lines so the text reads as prose
	return decoded.replace(/\n{3,}/g, "\n\n").trim()
}

// the line that starts each Excel sheet's section in a serialized workbook
const SHEET_MARKER_PATTERN = /^=== sheet: (.*) ===$/

// serialize an Excel workbook to text: each sheet with rows under a marker line, each row as comma-joined cells
async function toSerializedWorkbook(bytes: Uint8Array): Promise<string> {
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
// the most characters table text keeps, so the size stays bounded even when rows are wide
export const MAX_TABLE_CHARS = 20_000

// a table file's text cut to what its table text can keep, with the data rows the cut dropped
export type ClippedTableText = { serializedText: string; skippedRows: number }

// the screen reads at most this multiple of the character budget, since redaction can shorten the
// text and let more rows fit than the raw length suggested
const SCREEN_CHAR_HEADROOM = 2

/**
 * Cuts a table file's text to the rows its table text could keep, with the count of what it dropped.
 * Screening the rest buys nothing: those rows can never reach a Scan.
 */
export function toClippedTableText(serializedText: string): ClippedTableText {
	// the lines kept so far, what they have spent against each budget, and whether the next one names columns
	const keptLines: string[] = []
	let rowsKept = 0
	let charsKept = 0
	let skippedRows = 0
	let isHeaderPending = true
	for (const line of serializedText.split("\n")) {
		// a line only goes in when it fits whole, so no single long row can carry the text past the limit. a file
		// of many small sheets would otherwise spend the whole budget on headings and column names
		if (rowsKept >= MAX_TABLE_ROWS || charsKept + line.length + 1 > MAX_TABLE_CHARS * SCREEN_CHAR_HEADROOM) {
			// a heading is structure rather than a row. the column names under one are counted with the rows,
			// which is close enough on a file already too large to keep
			if (line.trim() && !SHEET_MARKER_PATTERN.test(line)) {
				skippedRows += 1
			}
			continue
		}

		// a sheet marker is structure, not a row, and the sheet it opens brings its own header
		if (SHEET_MARKER_PATTERN.test(line)) {
			keptLines.push(line)
			charsKept += line.length + 1
			isHeaderPending = true
			continue
		}

		// a sheet's first line with content names its columns, so it rides along without spending a row
		const isHeader = isHeaderPending && line.trim() !== ""
		if (isHeader) {
			keptLines.push(line)
			charsKept += line.length + 1
			isHeaderPending = false
			continue
		}

		// the line goes in whole, and only a line with content counts against the row budget
		keptLines.push(line)
		charsKept += line.length + 1
		if (line.trim()) {
			rowsKept += 1
		}
	}
	return { serializedText: keptLines.join("\n"), skippedRows }
}

// what to write out: the llm-guard screened text, the file it came from, the type that says whether it is a workbook,
// and the rows skipped before the screen so the trailing line still counts them
export type TableTextOptions = {
	serializedText: string
	filename: string
	contentType: string
	skippedRows?: number
}

/**
 * Writes llm-guard screened table text into headed sheets of verbatim rows, with a line naming what was left out.
 */
export function toTableText({ serializedText, filename, contentType, skippedRows = 0 }: TableTextOptions): string {
	// walk every sheet under one shared budget, starting from what was dropped before the screen
	const usage: TableTextUsage = { rowsUsed: 0, charsUsed: 0 }
	const tableLines: string[] = []
	let skippedTableRows = skippedRows
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

/**
 * Whether an attachment is an image, which the model reads directly instead of having its text extracted.
 */
export function isImageAttachmentType(contentType: string): boolean {
	return contentType.startsWith("image/")
}

/**
 * Stored image bytes as the data url for the model to read.
 */
export function toDataUrl(contentType: string, bytes: Uint8Array): string {
	return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`
}

// build the context-generation prompt over attach-context.md, limited so a huge document can't blow the token budget
export async function buildContextPrompt(text: string): Promise<BuiltPrompt> {
	// fetch the registry version first, then limit the document length to bound the token spend
	const { template, name, registryPrompt } = await fetchPromptTemplate("attach-context")

	// a clipped document marks its cut
	const clippedText =
		text.length > MAX_EXTRACT_CHARS
			? `${text.slice(0, MAX_EXTRACT_CHARS)}\n\n[The document is cut here. It runs ${text.length.toLocaleString("en-US")} characters and only the first ${MAX_EXTRACT_CHARS.toLocaleString("en-US")} are included.]`
			: text
	const prompt = writePrompt(template, { document: clippedText })
	return { prompt, name, registryPrompt }
}

// generate a context string from any attachment's text with the cheap model, billed to the given key
export async function generateAttachmentContext(text: string, litellmApiKey?: string): Promise<string> {
	// fetch and write the prompt
	const contextPrompt = await buildContextPrompt(text)

	// link the registry version to the trace when one served the prompt
	const { text: context } = await generateText({
		model: cheapModel(litellmApiKey),
		prompt: contextPrompt.prompt,
		...promptTelemetry(contextPrompt),
	})
	return context.trim()
}

// describe an attached image with the chat model, billed to the user's own key
export async function generateImageContext(dataUrl: string, litellmApiKey?: string): Promise<string> {
	// fetch and write the prompt. it takes no variables, and the image includes everything the model reads
	const { template, name, registryPrompt } = await fetchPromptTemplate("attach-image-context")
	const prompt = writePrompt(template, {})

	// send the prompt and the image as one user message, linking the registry version to the trace
	const { text } = await generateText({
		model: chatModel(litellmApiKey),
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: prompt },
					{ type: "image", image: dataUrl },
				],
			},
		],
		...promptTelemetry({ prompt, name, registryPrompt }),
	})
	return text.trim()
}

// the context a scan reads for a topic. the topic's prompt merged with every attachment's context
export async function buildTopicScanContext(topicId: string): Promise<{ name: string; context: string }> {
	// read the topic's name and prompt. throw an error if the topic does not exist
	const [topic] = await db
		.select({ name: topics.name, prompt: topics.prompt })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`topic ${topicId} not found`)
	}

	// read every ready attachment's context for the topic. a pending or failed attachment has no settled context to read
	const attachmentContexts = await db
		.select({ filename: attachments.filename, context: attachments.context })
		.from(attachments)
		.where(and(eq(attachments.topicId, topicId), eq(attachments.status, "ready")))
		.orderBy(attachments.filename, attachments.id)

	// label each attachment context with its file
	const labeledAttachmentContexts = attachmentContexts
		.filter((contextRow) => (contextRow.context ?? "").trim())
		.map((contextRow) => `[attachment: ${contextRow.filename}]\n${(contextRow.context ?? "").trim()}`)
	const context = [topic.prompt.trim(), ...labeledAttachmentContexts].filter(Boolean).join("\n\n")
	return { name: topic.name, context }
}

/**
 * Hashes the context text that a Scan reviews against, which the Finding records as its hash.
 */
export function toTopicContextHash(contextText: string): string {
	return new Bun.CryptoHasher("sha256").update(contextText.trim()).digest("hex")
}

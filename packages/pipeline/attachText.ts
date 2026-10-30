import { DOCX_TYPE, XLSX_TYPE } from "@carlnotes/contracts/attachmentTypes"
import { getDocumentProxy } from "unpdf"
import { AttachmentValidationError, isImageAttachmentType, toBaseContentType } from "./attachContentType"
import { toSerializedWorkbook } from "./attachTable"

// a file's text, and for a PDF whose read stopped before its last page, how many pages the PDF has
export type ExtractedText = { text: string; pdfPageCount?: number }

/**
 * Extracts an uploaded file's whole text. A workbook serializes its sheets.
 */
export async function extractText(contentType: string, bytes: Uint8Array): Promise<string> {
	const { text } = await extractTextUpTo(contentType, bytes, Number.POSITIVE_INFINITY)
	return text
}

/**
 * Extracts an uploaded file's text as extractText does, except that a PDF reads its pages in order and stops once its
 * text passes maxChars, so a file far longer than the caller keeps is never read whole. A PDF that stopped early
 * returns its page count beside the text. Every other type is read whole.
 */
export async function extractTextUpTo(
	contentType: string,
	bytes: Uint8Array,
	maxChars: number,
): Promise<ExtractedText> {
	// uploaded html decodes like text but is full of tags, so it converts to markdown first
	const baseContentType = toBaseContentType(contentType)
	if (baseContentType === "text/html") {
		return { text: htmlToMarkdown(decodeTextBytes(bytes, contentType)) }
	}

	// any other text type, and json, is already text
	if (baseContentType.startsWith("text/") || baseContentType === "application/json") {
		return { text: decodeTextBytes(bytes, contentType) }
	}

	// parse a PDF with unpdf, merging its pages into one string
	if (baseContentType === "application/pdf") {
		return extractPdfText(bytes, maxChars)
	}

	// a Word document gives its plain text. the parser loads lazily
	if (baseContentType === DOCX_TYPE) {
		const { default: mammoth } = await import("mammoth")
		const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
		return { text: value }
	}

	// a workbook serializes each sheet's rows
	if (baseContentType === XLSX_TYPE) {
		return { text: await toSerializedWorkbook(bytes) }
	}

	// an image includes no text to decode. the model reads it instead, so extraction is not its path
	if (isImageAttachmentType(baseContentType)) {
		throw new AttachmentValidationError(`an image is read by the model, not extracted: ${contentType}`)
	}

	// any other type has no extractor. reject so the caller stores nothing
	throw new AttachmentValidationError(`unsupported attachment content type: ${contentType}`)
}

// a PDF's pages merged into one string, read one page at a time until the text passes maxChars, with the PDF's page
// count if pages are left unread. each page's text joins its items, with a line break where an item ends a line, and
// the merge collapses whitespace as unpdf's own mergePages does
async function extractPdfText(bytes: Uint8Array, maxChars: number): Promise<ExtractedText> {
	const pdf = await getDocumentProxy(bytes)
	try {
		// read the pages in order, freeing each page once its text is read
		const pageTexts: string[] = []
		let charCount = 0
		for (let pageNumber = 1; pageNumber <= pdf.numPages && charCount <= maxChars; pageNumber++) {
			const page = await pdf.getPage(pageNumber)
			const { items } = await page.getTextContent()
			const pageText = items.map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : ""}` : "")).join("")
			page.cleanup()

			// count the page's text toward the limit
			pageTexts.push(pageText)
			charCount += pageText.length
		}

		// keep line breaks and at most one blank line, and collapse every other run of whitespace
		const text = pageTexts
			.join("\n")
			.replace(/[^\S\n]+/g, " ")
			.replace(/ ?\n ?/g, "\n")
			.replace(/\n{3,}/g, "\n\n")
		return pageTexts.length < pdf.numPages ? { text, pdfPageCount: pdf.numPages } : { text }
	} finally {
		// free the document, whether the read finished or threw
		await pdf.loadingTask.destroy()
	}
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

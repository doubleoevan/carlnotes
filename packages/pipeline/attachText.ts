import { extractText as extractPdfText } from "unpdf"
import {
	AttachmentValidationError,
	DOCX_TYPE,
	isImageAttachmentType,
	toBaseContentType,
	XLSX_TYPE,
} from "./attachContentType"
import { toSerializedWorkbook } from "./attachTable"

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

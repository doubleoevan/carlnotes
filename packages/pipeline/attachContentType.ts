// an attachment's content type: the canonical type from what the browser sent and the file name, and what each type is

import { DOCX_TYPE, toSuffixMimeType, XLSX_TYPE } from "@carlnotes/contracts/attachmentTypes"

/**
 * Returns a content type without its parameters, so a declared charset never breaks an exact match.
 */
export function toBaseContentType(contentType: string): string {
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

	// a filename without a known extension keeps the reported type
	return toSuffixMimeType(filename) ?? contentType
}

/** Whether an attachment holds rows: csv, tsv, or an Excel workbook. */
export function isTableFileType(contentType: string): boolean {
	const baseContentType = toBaseContentType(contentType)
	return (
		baseContentType === "text/csv" || baseContentType === "text/tab-separated-values" || baseContentType === XLSX_TYPE
	)
}

/**
 * Returns whether an attachment's content type is one Carl accepts.
 */
export function isSupportedAttachmentType(contentType: string): boolean {
	// text and JSON decode, PDF and the OOXML types parse, and an image goes to the model directly
	const baseType = toBaseContentType(contentType)
	// biome-ignore format: one line keeps the type list under the comment-density hook's limit
	return baseType.startsWith("text/") || baseType === "application/pdf" || baseType === "application/json" || baseType === DOCX_TYPE || baseType === XLSX_TYPE || isImageAttachmentType(baseType)
}

/**
 * Whether an attachment is an image, which the model reads directly instead of having its text extracted.
 */
export function isImageAttachmentType(contentType: string): boolean {
	return contentType.startsWith("image/")
}

// a rejection safe to show the user as written: their file or url, not an infra failure like a misconfigured llm proxy
export class AttachmentValidationError extends Error {}

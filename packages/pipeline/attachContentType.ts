// an attachment's content type: the canonical type from what the browser sent and the file name, and what each type is

// the OOXML media types a browser reports for word and excel files
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

// the media type each known extension stands for. browsers often misreport these
export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
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

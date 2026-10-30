// the file types the chat and topic attachment pickers offer, and the largest file a topic attachment takes

// the file extensions read as plain text when the picker gives no text/* type of its own
export const TEXT_FILE_SUFFIXES = [".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".log"]

// the video types both chat composers take, the ones the shared player can also stream back
export const VIDEO_FILE_TYPES = ["video/mp4", "video/quicktime", "video/webm"]

// the word and workbook types, which the server extracts words from like a pdf
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
export const DOCUMENT_FILE_TYPES = [DOCX_TYPE, XLSX_TYPE]
export const DOCUMENT_FILE_SUFFIXES = [".docx", ".xlsx"]

// what the topic attachment pickers offer
export const TOPIC_ATTACHMENT_ACCEPT = [
	"image/*",
	"application/pdf",
	".pdf",
	"text/*",
	...TEXT_FILE_SUFFIXES,
	...DOCUMENT_FILE_SUFFIXES,
]

// what the chat composers' pickers offer, named on their own so a widened topic list never widens chat
export const CHAT_ATTACHMENT_ACCEPT = [
	"image/*",
	"application/pdf",
	".pdf",
	"text/*",
	...TEXT_FILE_SUFFIXES,
	...DOCUMENT_FILE_SUFFIXES,
	...VIDEO_FILE_TYPES,
]

// the largest file a topic attachment upload takes, checked before any storage or model work
export const TOPIC_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

// what a user is told about a topic attachment over that size, by the api and by the app before it uploads
export const TOPIC_ATTACHMENT_TOO_LARGE_LINE = `That attachment is too large. The limit is ${TOPIC_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB.`

// what a topic keeps of a file: the name, the type, and the size
type TopicAttachmentFileDetails = { name: string; mimeType: string; byteSize: number }

/**
 * Returns why a topic cannot keep a file the new-topic chat took, or null for a file a topic attachment takes. The
 * chat takes video and the topic does not, and a topic attachment has its own size limit.
 */
export function toTopicAttachmentRejectionLine({
	name,
	mimeType,
	byteSize,
}: TopicAttachmentFileDetails): string | null {
	if (VIDEO_FILE_TYPES.includes(mimeType)) {
		return `${name} stays in this chat. A topic can't keep a video.`
	}
	return byteSize > TOPIC_ATTACHMENT_MAX_BYTES ? `${name} stays in this chat. ${TOPIC_ATTACHMENT_TOO_LARGE_LINE}` : null
}

// the mime type each known file suffix stands for. a picker or a browser often reports these wrongly or not at all
const SUFFIX_MIME_TYPES: Record<string, string> = {
	".txt": "text/plain",
	".log": "text/plain",
	".md": "text/markdown",
	".markdown": "text/markdown",
	".csv": "text/csv",
	".tsv": "text/tab-separated-values",
	".json": "application/json",
	".pdf": "application/pdf",
	".docx": DOCX_TYPE,
	".xlsx": XLSX_TYPE,
}

/**
 * Returns a picker accept list as the mime types a native document picker filters on. A suffix entry maps to its mime
 * type if no wildcard entry covers it.
 */
export function toPickerMimeTypes(accept: string[]): string[] {
	// keep each mime entry, then add the types the suffix entries stand for that no wildcard covers
	const mimeTypes = accept.filter((acceptEntry) => !acceptEntry.startsWith("."))
	for (const acceptEntry of accept) {
		const suffixMimeType = SUFFIX_MIME_TYPES[acceptEntry]
		if (suffixMimeType && !accept.includes(`${suffixMimeType.split("/")[0]}/*`)) {
			mimeTypes.push(suffixMimeType)
		}
	}
	return [...new Set(mimeTypes)]
}

/**
 * Returns the mime type a file name's known suffix stands for, or null for any other name.
 */
export function toSuffixMimeType(name: string): string | null {
	const suffix = name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ""
	return SUFFIX_MIME_TYPES[suffix] ?? null
}

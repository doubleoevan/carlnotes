// the chat attachment rules both apps share: which kind a file is, the size each kind may run, and the lines a
// rejected file shows

import {
	DOCUMENT_FILE_SUFFIXES,
	DOCUMENT_FILE_TYPES,
	TEXT_FILE_SUFFIXES,
	VIDEO_FILE_TYPES,
} from "@carlnotes/contracts/attachmentTypes"
import {
	CHAT_ATTACHMENT_KEEP_LIMIT,
	CHAT_IMAGE_DATA_CHARS,
	CHAT_MAX_ATTACHMENTS,
	CHAT_PDF_DATA_CHARS,
	CHAT_VIDEO_DATA_CHARS,
	clipAttachmentText,
} from "@carlnotes/contracts/chat"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { toDataUrlSizeLabel } from "./labels"

// a chat attachment kind sent as a data url, and the kinds a file can be read as
type DataUrlAttachmentKind = "image" | "pdf" | "document" | "video"
export type ChatAttachmentFileKind = DataUrlAttachmentKind | "text"

// one picked file as either app reads it: its name, its type, its size, and the reads of its bytes
export type ChatAttachmentFileReader = {
	name: string
	mimeType: string
	byteSize: number
	readDataUrl: () => Promise<string>
	readText: () => Promise<string>
}

// the line a file of a kind no chat takes shows
export const UNSUPPORTED_ATTACHMENT_LINE =
	"Carl takes images, PDFs, Word and Excel files, text files, and videos for now."

// the line a private question shows once it holds every attachment it may
export const QUESTION_FULL_LINE = `${CHAT_MAX_ATTACHMENTS} attachments max per question.`

// the line a chat room message shows once it holds every attachment it may
export const MESSAGE_FULL_LINE = `${CHAT_MAX_ATTACHMENTS} attachments max per message.`

// the line a file shows once the topic keeps as many files as it may
export const KEEP_LIMIT_LINE = `Carl's already keeping ${CHAT_ATTACHMENT_KEEP_LIMIT} files for this topic. He'll read this one, but it won't get stored.`

// each data url kind's size limit and the line that names it, whose size reads from the limit itself
const DATA_URL_KIND_LIMITS = {
	image: {
		maxChars: CHAT_IMAGE_DATA_CHARS,
		tooLargeLine: `That image is too large. About ${toDataUrlSizeLabel(CHAT_IMAGE_DATA_CHARS)} is the limit.`,
	},
	pdf: {
		maxChars: CHAT_PDF_DATA_CHARS,
		tooLargeLine: `That PDF is too large. About ${toDataUrlSizeLabel(CHAT_PDF_DATA_CHARS)} is the limit.`,
	},
	document: {
		maxChars: CHAT_PDF_DATA_CHARS,
		tooLargeLine: `That file is too large. About ${toDataUrlSizeLabel(CHAT_PDF_DATA_CHARS)} is the limit.`,
	},
	video: {
		maxChars: CHAT_VIDEO_DATA_CHARS,
		tooLargeLine: `That video is too large. About ${toDataUrlSizeLabel(CHAT_VIDEO_DATA_CHARS)} is the limit.`,
	},
} as const

// the fallback names for files that arrive unnamed
const UNNAMED_FILE_NAMES = { image: "image", pdf: "document.pdf", document: "document", video: "video" } as const

// the type a data url names when the file reports none
const UNTYPED_DATA_URL_TYPE = "application/octet-stream"

/**
 * Returns the kind a chat reads a file as, from its type and then its name, or null for a kind no chat takes.
 */
export function toChatAttachmentFileKind({
	name,
	mimeType,
}: {
	name: string
	mimeType: string
}): ChatAttachmentFileKind | null {
	// a PDF by its type or its suffix, then an image by its type
	const lowerName = name.toLowerCase()
	if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
		return "pdf"
	}
	if (mimeType.startsWith("image/")) {
		return "image"
	}

	// a video, then a word file or workbook by its type or its suffix
	if (VIDEO_FILE_TYPES.includes(mimeType)) {
		return "video"
	}
	if (DOCUMENT_FILE_TYPES.includes(mimeType) || DOCUMENT_FILE_SUFFIXES.some((suffix) => lowerName.endsWith(suffix))) {
		return "document"
	}

	// text by its type or its suffix, and nothing else
	if (mimeType.startsWith("text/") || TEXT_FILE_SUFFIXES.some((suffix) => lowerName.endsWith(suffix))) {
		return "text"
	}
	return null
}

/**
 * Returns how long a file's base64 data url runs, from its byte size and type, before any of it is read.
 */
export function toDataUrlChars({ byteSize, mimeType }: { byteSize: number; mimeType: string }): number {
	// base64 writes every 3 bytes as 4 characters, after the data url's own prefix
	const prefix = `data:${mimeType || UNTYPED_DATA_URL_TYPE};base64,`
	return prefix.length + Math.ceil(byteSize / 3) * 4
}

/**
 * Returns one picked file as a chat attachment, or null after notifying why a file was rejected. A file too large for
 * its kind is rejected before any of it is read.
 */
export async function toChatAttachment(
	source: ChatAttachmentFileReader,
	notify: (line: string) => void,
): Promise<ChatAttachment | null> {
	// a kind no chat takes is rejected by name
	const kind = toChatAttachmentFileKind(source)
	if (!kind) {
		notify(UNSUPPORTED_ATTACHMENT_LINE)
		return null
	}

	// text files post as raw text, clipped to the limit with the cut point marked for the model
	if (kind === "text") {
		const text = await source.readText()
		return { kind: "text", name: source.name || "text", text: clipAttachmentText(text), keep: false }
	}

	// a file past its kind's limit rejects before it is read, and again on the read's exact length
	const { maxChars, tooLargeLine } = DATA_URL_KIND_LIMITS[kind]
	if (toDataUrlChars(source) > maxChars) {
		notify(tooLargeLine)
		return null
	}
	// read it, then check its exact length
	const dataUrl = await source.readDataUrl()
	if (dataUrl.length > maxChars) {
		notify(tooLargeLine)
		return null
	}
	return { kind, name: source.name || UNNAMED_FILE_NAMES[kind], dataUrl, keep: false }
}

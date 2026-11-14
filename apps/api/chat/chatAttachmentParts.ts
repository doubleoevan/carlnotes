// the parts a chat turn's attachments become: what the model reads in place of each one, the text a file is read
// into, and the two data url helpers
import type { ChatAttachmentRejection } from "@carlnotes/contracts/chat"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { toCanonicalContentType } from "@carlnotes/pipeline/attachContentType"
import { AttachmentExtractionLimitError } from "@carlnotes/pipeline/attachExtraction"
import { reportError } from "@carlnotes/server/monitoring"
import { extractTextInChildProcess, toExtractionDeadline } from "./attachmentExtraction"

// what stands in for a video's content wherever carl reads attachments
export const VIDEO_ATTACHMENT_CONTEXT = "A video Carl can't watch yet."

// a sent file whose words are extracted: a PDF, a Word file, or a workbook
export type ExtractableChatAttachment = Extract<ChatAttachment, { kind: "pdf" | "document" }>

// when a request's files have to be read by, from toExtractionDeadline, and the user who sent them, whose files are
// read one at a time
type ChatAttachmentRead = { deadline: number; userId: string }

// the file to read, its bytes if the caller already decoded them, the request's deadline, and the user who sent it
type ReadChatAttachmentTextOptions = ChatAttachmentRead & { attachment: ExtractableChatAttachment; bytes?: Uint8Array }

// why a file was not read before its request's deadline: its read ran past it, or it waited behind other files
export type PastDeadlineRejection = Exclude<ChatAttachmentRejection, "attachmentUnreadable">

// a sent attachment that may be stored. a PDF, Word file, or workbook includes the text extracted from it, so storing
// it never extracts the file again
export type StorableChatAttachment =
	| Exclude<ChatAttachment, { kind: "pdf" | "document" }>
	| (ExtractableChatAttachment & { extractedText: string })

// what a chat turn's attachments resolve into: what the model reads, and the sent attachments that may be stored
export type ResolvedChatAttachments = {
	chatAttachments: ChatAttachment[]
	storableAttachments: StorableChatAttachment[]
}

/**
 * Resolves a chat turn's attachments into what the model reads. A PDF becomes its extracted text, an image reaches the
 * model as an image, a video becomes a line saying it can't be watched, and text is posted as written, inside the
 * nonce fence. Returns the rejection if a file cannot be read.
 */
export async function resolveChatAttachments(
	attachments: ChatAttachment[],
	userId: string,
): Promise<ResolvedChatAttachments | ChatAttachmentRejection> {
	// every file of the chat turn shares one deadline, so the turn always responds before the server's idle timeout
	const chatAttachments: ChatAttachment[] = []
	const storableAttachments: StorableChatAttachment[] = []
	const chatAttachmentRead = { deadline: toExtractionDeadline(), userId }
	for (const attachment of attachments) {
		// one unreadable file rejects the whole chat turn instead of sending half of it
		const resolvedChatAttachment = await resolveChatAttachment(attachment, chatAttachmentRead)
		if (typeof resolvedChatAttachment === "string") {
			return resolvedChatAttachment
		}

		// what the model reads, and the sent attachment that may be stored
		chatAttachments.push(resolvedChatAttachment.chatAttachment)
		storableAttachments.push(resolvedChatAttachment.storableAttachment)
	}
	return { chatAttachments, storableAttachments }
}

// one attachment as the model reads it, and the sent attachment that may be stored. the rejection if a file cannot be
// read before the chat turn's deadline
async function resolveChatAttachment(
	attachment: ChatAttachment,
	chatAttachmentRead: ChatAttachmentRead,
): Promise<{ chatAttachment: ChatAttachment; storableAttachment: StorableChatAttachment } | ChatAttachmentRejection> {
	// an image reaches the model as an image
	if (attachment.kind === "image") {
		return { chatAttachment: attachment, storableAttachment: attachment }
	}

	// a video has no words and carl can't watch it, so the model reads only that a clip was attached
	if (attachment.kind === "video") {
		const videoLine: ChatAttachment = {
			kind: "text",
			name: attachment.name,
			text: VIDEO_ATTACHMENT_CONTEXT,
			keep: false,
		}
		return { chatAttachment: videoLine, storableAttachment: attachment }
	}

	// a pdf, word file, or workbook includes bytes, so its words come out here, once, for the model and the store
	if (attachment.kind === "pdf" || attachment.kind === "document") {
		const chatAttachmentText = await readChatAttachmentText({ attachment, ...chatAttachmentRead })
		if ("rejection" in chatAttachmentText) {
			return chatAttachmentText.rejection
		}
		const extractedText = chatAttachmentText.text
		return {
			chatAttachment: toTextAttachment(attachment.name, extractedText),
			storableAttachment: { ...attachment, extractedText },
		}
	}

	// a text attachment includes its own words
	return {
		chatAttachment: toTextAttachment(attachment.name, attachment.text),
		storableAttachment: attachment,
	}
}

/**
 * Returns a sent file's text, extracted in a child process and held to the attachment text limit, for a chat turn and
 * a chat room post alike. The bytes are the file's data url decoded unless the caller already decoded them. A file
 * that cannot be read is logged and reported, and returns why: a file the child process cannot parse is unreadable, a
 * file whose read ran past the request's deadline or the memory limit is too large, and a file that waited behind
 * other files until the deadline is busy.
 */
export async function readChatAttachmentText({
	attachment,
	bytes = decodeDataUrl(attachment.dataUrl),
	deadline,
	userId,
}: ReadChatAttachmentTextOptions): Promise<{ text: string } | { rejection: ChatAttachmentRejection }> {
	try {
		const contentType = toCanonicalContentType(contentTypeFromDataUrl(attachment.dataUrl), attachment.name)
		return { text: await extractTextInChildProcess({ contentType, bytes, deadline, userId }) }
	} catch (error) {
		// the log and the report are the only record of why a file was not read
		console.error("chat attachment extraction failed", error)
		reportError(error, "chat", { attachmentKind: attachment.kind })
		return { rejection: toChatAttachmentRejection(error) }
	}
}

// why a file was not read: other files kept the child processes busy past its deadline, its read ran past the deadline
// or the memory limit, or the child process could not parse it
function toChatAttachmentRejection(error: unknown): ChatAttachmentRejection {
	if (!(error instanceof AttachmentExtractionLimitError)) {
		return "attachmentUnreadable"
	}
	return error.limit === "wait" ? "attachmentBusy" : "attachmentTooLarge"
}

// the text that gets posted. keep stays false on this copy
function toTextAttachment(name: string, text: string): ChatAttachment {
	return { kind: "text", name, text, keep: false }
}

// a data url's base64 tail, decoded to the bytes it encodes. new Uint8Array copies the decoded buffer whole, where
// Uint8Array.from copies it one byte at a time
export function decodeDataUrl(dataUrl: string): Uint8Array {
	return new Uint8Array(Buffer.from(dataUrl.split(",")[1] ?? "", "base64"))
}

// the media type a data url declares, read from its own prefix instead of being assumed by the attachment kind
export function contentTypeFromDataUrl(dataUrl: string): string {
	return dataUrl.slice("data:".length).split(/[;,]/)[0] || "application/octet-stream"
}

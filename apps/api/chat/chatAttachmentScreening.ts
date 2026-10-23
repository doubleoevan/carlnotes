// screening the attachments a user sends with a chat turn: what the model reads in place of each one, the text a file
// is read into, the screen a stored attachment's words take, and the two data url helpers
import { type ChatAttachmentRejection, clipAttachmentText } from "@carlnotes/contracts/chat"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { type ScreenVerdict, screenImage, screenText, toFlaggedReason } from "@carlnotes/models/guard"
import { toCanonicalContentType } from "@carlnotes/pipeline/attachContentType"
import { reportError } from "@carlnotes/server/monitoring"
import {
	AttachmentBusyError,
	AttachmentTimeLimitError,
	extractTextInWorker,
	toExtractionDeadline,
} from "./attachmentExtraction"

// what stands in for a video's content wherever carl reads attachments
export const VIDEO_ATTACHMENT_CONTEXT = "A video Carl can't watch yet."

// a sent file whose words are extracted: a PDF, a Word file, or a workbook
export type ExtractableChatAttachment = Extract<ChatAttachment, { kind: "pdf" | "document" }>

// the file to read, its bytes if the caller already decoded them, and the request's deadline from toExtractionDeadline
type ReadChatAttachmentTextOptions = { attachment: ExtractableChatAttachment; bytes?: Uint8Array; deadline: number }

// why a file was not read before its request's deadline: its read ran past it, or it waited behind other files
export type PastDeadlineRejection = Exclude<ChatAttachmentRejection, "attachmentUnreadable">

// a sent attachment that may be stored. a PDF, Word file, or workbook includes the text extracted from it, so storing
// it never extracts the file again
export type StorableChatAttachment =
	| Exclude<ChatAttachment, { kind: "pdf" | "document" }>
	| (ExtractableChatAttachment & { extractedText: string })

// what a chat turn's attachments resolve into: what the model reads, and the sent attachments that may be stored.
// an image withheld by the screen is left out of what may be stored, so it is never stored or described
export type ResolvedChatAttachments = {
	chatAttachments: ChatAttachment[]
	storableAttachments: StorableChatAttachment[]
}

/**
 * Resolves a chat turn's attachments into what the model takes. A PDF becomes its extracted text, an image is screened
 * by the text it shows, a video becomes a line saying it can't be watched, and text is screened by llm-guard first.
 * A flagged attachment becomes a line saying it was withheld. The rejection if a file cannot be read, so the route can
 * reject the chat turn with its reason.
 */
export async function resolveChatAttachments(
	attachments: ChatAttachment[],
): Promise<ResolvedChatAttachments | ChatAttachmentRejection> {
	// every file of the chat turn shares one deadline, so the turn always responds before the server's idle timeout
	const chatAttachments: ChatAttachment[] = []
	const storableAttachments: StorableChatAttachment[] = []
	const deadline = toExtractionDeadline()
	for (const attachment of attachments) {
		// one unreadable file rejects the whole chat turn instead of sending half of it
		const resolvedChatAttachment = await resolveChatAttachment(attachment, deadline)
		if (typeof resolvedChatAttachment === "string") {
			return resolvedChatAttachment
		}

		// what the model reads, and the sent attachment if it may be stored
		chatAttachments.push(resolvedChatAttachment.chatAttachment)
		if (resolvedChatAttachment.storableAttachment) {
			storableAttachments.push(resolvedChatAttachment.storableAttachment)
		}
	}
	return { chatAttachments, storableAttachments }
}

// one attachment as the model reads it, and the sent attachment if it may be stored. the rejection if a file cannot be
// read before the chat turn's deadline
async function resolveChatAttachment(
	attachment: ChatAttachment,
	deadline: number,
): Promise<
	{ chatAttachment: ChatAttachment; storableAttachment: StorableChatAttachment | null } | ChatAttachmentRejection
> {
	// an image is screened by the text it shows. a flagged one is withheld from the turn and never stored
	if (attachment.kind === "image") {
		const imageScreenVerdict = await screenImage(decodeDataUrl(attachment.dataUrl))
		return imageScreenVerdict.isFlagged
			? { chatAttachment: toWithheldAttachment(attachment.name, imageScreenVerdict), storableAttachment: null }
			: { chatAttachment: attachment, storableAttachment: attachment }
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
		const chatAttachmentText = await readChatAttachmentText({ attachment, deadline })
		if ("rejection" in chatAttachmentText) {
			return chatAttachmentText.rejection
		}
		const extractedText = chatAttachmentText.text
		return {
			chatAttachment: await toScreenedTextAttachment(attachment.name, extractedText),
			storableAttachment: { ...attachment, extractedText },
		}
	}

	// a text attachment includes its own words
	return {
		chatAttachment: await toScreenedTextAttachment(attachment.name, attachment.text),
		storableAttachment: attachment,
	}
}

/**
 * Returns a sent file's text, extracted in the worker thread and held to the attachment text limit, for a chat turn and
 * a chat room post alike. The bytes are the file's data url decoded unless the caller already decoded them, and they
 * are transferred to the worker thread. A file that cannot be read is logged and reported, and returns why: a file the
 * worker thread cannot parse is unreadable, a file whose read ran past the request's deadline is too large, and a file
 * that waited behind other files until the deadline is busy.
 */
export async function readChatAttachmentText({
	attachment,
	bytes = decodeDataUrl(attachment.dataUrl),
	deadline,
}: ReadChatAttachmentTextOptions): Promise<{ text: string } | { rejection: ChatAttachmentRejection }> {
	try {
		const contentType = toCanonicalContentType(contentTypeFromDataUrl(attachment.dataUrl), attachment.name)
		return { text: await extractTextInWorker({ contentType, bytes, deadline }) }
	} catch (error) {
		// the log and the report are the only record of why a file was not read
		console.error("chat attachment extraction failed", error)
		reportError(error, "chat", { attachmentKind: attachment.kind })
		return { rejection: toChatAttachmentRejection(error) }
	}
}

// why a file was not read: other files kept the worker thread busy past its deadline, its read ran past the deadline,
// or the worker thread could not parse it
function toChatAttachmentRejection(error: unknown): ChatAttachmentRejection {
	if (error instanceof AttachmentBusyError) {
		return "attachmentBusy"
	}
	return error instanceof AttachmentTimeLimitError ? "attachmentTooLarge" : "attachmentUnreadable"
}

// the screened text that gets posted, or the withheld line if the screen flags it. keep stays false on this copy
async function toScreenedTextAttachment(name: string, text: string): Promise<ChatAttachment> {
	const screenVerdict = await screenText(text, "document")
	return screenVerdict.isFlagged
		? toWithheldAttachment(name, screenVerdict)
		: { kind: "text", name, text: screenVerdict.text, keep: false }
}

// the line the model reads in place of a flagged attachment, naming the detectors that fired
function toWithheldAttachment(name: string, screenVerdict: ScreenVerdict): ChatAttachment {
	return { kind: "text", name, text: `[This attachment was withheld: ${toFlaggedReason(screenVerdict)}.]`, keep: false }
}

// the words that a kept attachment stores, or null if the scanner flags it
export async function screenAttachmentText(text: string, sourceLabel: string, topicId: string): Promise<string | null> {
	// clip before screening. the scanner fails once it runs past its own deadline. an unbounded body should not skip the
	// check
	const screenVerdict = await screenText(clipAttachmentText(text), "document")
	if (screenVerdict.isFlagged) {
		reportFlaggedAttachment(screenVerdict, sourceLabel, topicId)
		return null
	}
	return screenVerdict.text
}

/**
 * Logs and reports an attachment the scanner flagged, naming the detectors that fired.
 */
export function reportFlaggedAttachment(screenVerdict: ScreenVerdict, sourceLabel: string, topicId: string): void {
	console.error(`a ${sourceLabel} for topic ${topicId} was ${toFlaggedReason(screenVerdict)}`)
	reportError(new Error(toFlaggedReason(screenVerdict)), "chat", { topicId })
}

// a data url's base64 tail, decoded to the bytes it encodes. new Uint8Array copies the decoded buffer whole, where
// Uint8Array.from copies it one byte at a time
export function decodeDataUrl(dataUrl: string): Uint8Array {
	return new Uint8Array(Buffer.from(dataUrl.split(",")[1] ?? "", "base64"))
}

// the media type a data url declares, read from its own prefix instead of being assumed by the attachment kind
export function contentTypeFromDataUrl(dataUrl: string): string {
	return dataUrl.slice("data:".length, dataUrl.indexOf(";")) || "application/octet-stream"
}

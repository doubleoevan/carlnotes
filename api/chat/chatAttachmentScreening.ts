// screening the attachments a user sends with a chat turn: what the model reads in place of each one, the screen a
// stored attachment's words take, and the two data url helpers
import { clipAttachmentText } from "@shared/contracts/chat"
import { reportError } from "@shared/monitoring"
import type { ChatAttachment } from "@shared/payloads"
import { extractText, toCanonicalContentType } from "../../worker"
import { type ScreenVerdict, screenImage, screenText, toFlaggedReason } from "../../worker/guard"

// what stands in for a video's content wherever carl reads attachments
export const VIDEO_ATTACHMENT_CONTEXT = "A video Carl can't watch yet."

// what a chat turn's attachments resolve into: what the model reads, and the sent attachments that may be stored.
// an image withheld by the screen is left out of what may be stored, so it is never stored or described
export type ResolvedChatAttachments = { chatAttachments: ChatAttachment[]; storableAttachments: ChatAttachment[] }

/**
 * Resolves a chat turn's attachments into what the model takes. A PDF becomes its extracted text, an image is screened
 * by the text it shows, a video becomes a line saying it can't be watched, and text is screened by llm-guard first.
 * A flagged attachment becomes a line saying it was withheld. Null if a PDF cannot be read, so the route can reject
 * the chat turn.
 */
export async function resolveChatAttachments(attachments: ChatAttachment[]): Promise<ResolvedChatAttachments | null> {
	const chatAttachments: ChatAttachment[] = []
	const storableAttachments: ChatAttachment[] = []
	for (const attachment of attachments) {
		// one unreadable file rejects the whole chat turn instead of sending half of it
		const resolvedChatAttachment = await resolveChatAttachment(attachment)
		if (resolvedChatAttachment === null) {
			return null
		}

		// what the model reads, and the sent attachment if it may be stored
		chatAttachments.push(resolvedChatAttachment.chatAttachment)
		if (resolvedChatAttachment.isStorable) {
			storableAttachments.push(attachment)
		}
	}
	return { chatAttachments, storableAttachments }
}

// one attachment as the model reads it, and whether the sent attachment may be stored. null if a file cannot be read
async function resolveChatAttachment(
	attachment: ChatAttachment,
): Promise<{ chatAttachment: ChatAttachment; isStorable: boolean } | null> {
	// an image is screened by the text it shows. a flagged one is withheld from the turn and never stored
	if (attachment.kind === "image") {
		const imageScreenVerdict = await screenImage(decodeDataUrl(attachment.dataUrl))
		return imageScreenVerdict.isFlagged
			? { chatAttachment: toWithheldAttachment(attachment.name, imageScreenVerdict), isStorable: false }
			: { chatAttachment: attachment, isStorable: true }
	}

	// a video has no words and carl can't watch it, so the model reads only that a clip was attached
	if (attachment.kind === "video") {
		const videoLine: ChatAttachment = {
			kind: "text",
			name: attachment.name,
			text: VIDEO_ATTACHMENT_CONTEXT,
			keep: false,
		}
		return { chatAttachment: videoLine, isStorable: true }
	}

	// a pdf, word file, or workbook hands over bytes, so its words come out here. a text attachment has its own
	let text: string
	if (attachment.kind === "pdf" || attachment.kind === "document") {
		try {
			const bytes = decodeDataUrl(attachment.dataUrl)
			const contentType = toCanonicalContentType(contentTypeFromDataUrl(attachment.dataUrl), attachment.name)
			text = clipAttachmentText(await extractText(contentType, bytes))
		} catch (error) {
			// an unreadable file rejects the whole chat turn instead of sending half of it
			console.error("chat attachment extraction failed", error)
			reportError(error, "chat", { attachmentKind: attachment.kind })
			return null
		}
	} else {
		text = attachment.text
	}

	// the screened text is what gets posted. keep stays false on this copy
	const screenVerdict = await screenText(text, "document")
	const chatAttachment: ChatAttachment = screenVerdict.isFlagged
		? toWithheldAttachment(attachment.name, screenVerdict)
		: { kind: "text", name: attachment.name, text: screenVerdict.text, keep: false }
	return { chatAttachment, isStorable: true }
}

// the line the model reads in place of a flagged attachment, naming the detectors that fired
function toWithheldAttachment(name: string, screenVerdict: ScreenVerdict): ChatAttachment {
	return { kind: "text", name, text: `[This attachment was withheld: ${toFlaggedReason(screenVerdict)}.]`, keep: false }
}

// the words that a kept attachment stores, or null if the scanner flags it
export async function screenAttachmentText(text: string, sourceLabel: string, topicId: string): Promise<string | null> {
	// clip before screening. the scanner fails once it runs past its own deadline. an unbounded body should not skip the check
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

// a data url's base64 tail, decoded to the bytes it encodes
export function decodeDataUrl(dataUrl: string): Uint8Array {
	return Uint8Array.from(Buffer.from(dataUrl.split(",")[1] ?? "", "base64"))
}

// the media type a data url declares, read from its own prefix instead of being assumed by the attachment kind
export function contentTypeFromDataUrl(dataUrl: string): string {
	return dataUrl.slice("data:".length, dataUrl.indexOf(";")) || "application/octet-stream"
}

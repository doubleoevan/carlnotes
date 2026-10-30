// the draft's attachments, read from the browser's own files

import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import {
	type ChatAttachments,
	useChatAttachments as useSharedChatAttachments,
} from "@carlnotes/core/hooks/useChatAttachments"
import { type ChatAttachmentFileReader, toChatAttachment } from "@carlnotes/core/lib/chatAttachmentRules"
import { toast } from "sonner"

/**
 * The attachments one question holds and the ones the topic keeps, read through the browser's file reader. A chat
 * room's message keeps nothing.
 */
export function useChatAttachments({ isRoom = false }: { isRoom?: boolean } = {}): ChatAttachments<File> {
	return useSharedChatAttachments({ toFileReader: toBrowserFileReader, notify: toast, isRoom })
}

/**
 * Returns a selected or pasted file as a chat attachment, or null after a toast says why it was rejected.
 */
export function toAttachment(file: File): Promise<ChatAttachment | null> {
	return toChatAttachment(toBrowserFileReader(file), toast)
}

// a browser file as the shared rules read it
function toBrowserFileReader(file: File): ChatAttachmentFileReader {
	return {
		name: file.name,
		mimeType: file.type,
		byteSize: file.size,
		readDataUrl: () => toDataUrl(file),
		readText: () => file.text(),
	}
}

// a file's bytes as a data url, through the browser's own reader
function toDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const fileReader = new FileReader()
		fileReader.onload = () => resolve(String(fileReader.result))
		fileReader.onerror = () => reject(fileReader.error)
		fileReader.readAsDataURL(file)
	})
}

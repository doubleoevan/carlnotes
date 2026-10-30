// what a rejected chat turn says in carl's words, the voice recording's toasts, and the toast that says why a
// chat turn was rejected

import type { ChatRejection } from "@carlnotes/client/chatClient"
import { CHAT_REJECTION_COPY } from "@carlnotes/core/lib/chatRejectionCopy"
import { toast } from "sonner"

export { CHAT_REJECTION_COPY } from "@carlnotes/core/lib/chatRejectionCopy"

// the toasts: the browser rejected the microphone request, no speech was recorded or transcribed, and the chat failed
export const MICROPHONE_REJECTED_TOAST = "Carl can't hear you. Type it, he reads fast."
export const NO_SPEECH_TOAST = "Carl didn't catch that. Please try again."
export const CHAT_FAILED_TOAST = `${CHAT_REJECTION_COPY.failed} Please try again.`

/**
 * Says why a chat turn was rejected. A spent budget calls onBudgetRejected if it is set, and every other rejection
 * toasts, asking for another try if the chat failed.
 */
export function toastChatRejection(chatRejection: ChatRejection, onBudgetRejected?: () => void): void {
	if (chatRejection === "budget" && onBudgetRejected) {
		onBudgetRejected()
		return
	}
	toast(chatRejection === "failed" ? CHAT_FAILED_TOAST : CHAT_REJECTION_COPY[chatRejection])
}

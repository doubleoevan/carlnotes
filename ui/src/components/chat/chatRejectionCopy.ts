// what a rejected chat turn says in carl's words, the voice recording's toasts, the link that opens the plans page, and
// the toast that says why a chat turn was rejected
import { SPENT_BUDGET_LINE } from "@shared/contracts/chat"
import { toast } from "sonner"
import type { ChatRejection } from "@/clients/chatClient"

/** The sentence for each chat rejection. */
export const CHAT_REJECTION_COPY: Record<ChatRejection, string> = {
	budget: SPENT_BUDGET_LINE,
	rateLimited: "Carl needs a minute to catch up. Ask again shortly.",
	forbidden: "Carl can't talk about that.",
	failed: "Carl lost his train of thought.",
}

// the label and path of the link that opens the plans page
export const PLANS_ACTION_LABEL = "Pick up more coffee"
export const PLANS_PATH = "/plans"

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

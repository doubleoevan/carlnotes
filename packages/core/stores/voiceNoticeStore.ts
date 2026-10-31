// what the voice controls say outside the composer: a transient line, the spent budget's line, and why a chat turn
// was rejected. each platform registers its own notices, the web's toasts and the mobile app's alert
import type { ChatRejection } from "@carlnotes/client/chatClient"
import { CHAT_FAILED_NOTICE, CHAT_REJECTION_COPY } from "../lib/chatRejectionCopy"
import type { VoiceNoticeAction } from "../lib/voiceRecorder"

// how the platform shows a voice notice
export type VoiceNotices = {
	// a transient line, with an action beside it if one is given
	showNotice: (message: string, action?: VoiceNoticeAction) => void
	// show the spent budget's line in the platform's own way
	showSpentBudgetNotice: () => void
}

// the registered notices, which say nothing until a platform registers its own
let voiceNotices: VoiceNotices | null = null

/**
 * Registers the platform's voice notices, and returns the call that removes them.
 */
export function registerVoiceNotices(nextVoiceNotices: VoiceNotices): () => void {
	voiceNotices = nextVoiceNotices
	return () => {
		if (voiceNotices === nextVoiceNotices) {
			voiceNotices = null
		}
	}
}

/**
 * Shows a transient voice line, with an action beside it if one is given.
 */
export function showVoiceNotice(message: string, action?: VoiceNoticeAction): void {
	voiceNotices?.showNotice(message, action)
}

/**
 * Shows the spent budget's line in the platform's own way.
 */
export function showSpentBudgetNotice(): void {
	voiceNotices?.showSpentBudgetNotice()
}

/**
 * Says why a chat turn was rejected. A spent budget calls onBudgetRejected if it is set, and every other rejection
 * shows its line, asking for another try if the chat failed.
 */
export function showChatRejectionNotice(chatRejection: ChatRejection, onBudgetRejected?: () => void): void {
	if (chatRejection === "budget" && onBudgetRejected) {
		onBudgetRejected()
		return
	}
	showVoiceNotice(chatRejection === "failed" ? CHAT_FAILED_NOTICE : CHAT_REJECTION_COPY[chatRejection])
}

// the fixtures the voice tests share: the notices a test collects, and the wait for the spoken answer queue to settle
import { registerVoiceNotices } from "./voiceNoticeStore"

/**
 * Registers notices that collect what the voice shows: each line with its action's label in brackets, and "spent
 * budget" for a spent budget's notice. Returns the collected notices and the call that unregisters them.
 */
export function collectVoiceNotices(): { notices: string[]; unregister: () => void } {
	const notices: string[] = []
	const unregister = registerVoiceNotices({
		showNotice: (message, action) => notices.push(action ? `${message} [${action.label}]` : message),
		showSpentBudgetNotice: () => notices.push("spent budget"),
	})
	return { notices, unregister }
}

/**
 * Waits for the spoken answer queue's fetches and plays to settle.
 */
export async function flushSpokenAnswerQueue(): Promise<void> {
	for (let i = 0; i < 5; i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
}

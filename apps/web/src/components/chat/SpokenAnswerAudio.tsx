import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import { CHAT_REJECTION_COPY } from "@carlnotes/core/lib/chatRejectionCopy"
import { registerVoiceNotices } from "@carlnotes/core/stores/voiceNoticeStore"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { registerSpokenAnswerAudio } from "@/stores/spokenAnswerStore"

/**
 * The audio element that the hosts' spoken answers play through, and the toasts that show the voice notices.
 */
export function SpokenAnswerAudio() {
	// register the audio element with the spoken answer store
	const audioRef = useRef<HTMLAudioElement>(null)
	useEffect(() => (audioRef.current ? registerSpokenAnswerAudio(audioRef.current) : undefined), [])

	// register the voice notices as toasts, and the spent budget's toast with the plans link
	useEffect(
		() =>
			registerVoiceNotices({
				showNotice: (message, action) =>
					action ? toast(message, { action: { label: action.label, onClick: action.onPress } }) : toast(message),
				showSpentBudgetNotice: toastSpentBudget,
			}),
		[],
	)
	return (
		// biome-ignore lint/a11y/useMediaCaption: carl's spoken answer is the reply text already on screen
		<audio ref={audioRef} preload="auto" />
	)
}

// toast the spent budget's upgrade line, with the action that opens the plans page
function toastSpentBudget(): void {
	toast(CHAT_REJECTION_COPY.budget, {
		action: { label: PURCHASE_COPY.pickUpMoreCoffee, onClick: () => window.location.assign(PLANS_PATH) },
	})
}

// the spoken answer player for the signed-in account, the voice notices, and the sweep of the voice's cache files at
// launch and when the account ends
import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import { CHAT_REJECTION_COPY } from "@carlnotes/core/lib/chatRejectionCopy"
import { usePurchaseOffers } from "@carlnotes/core/stores/purchaseOffersStore"
import { clearSpokenAnswers, registerSpokenAnswerPlayer } from "@carlnotes/core/stores/spokenAnswerStore"
import { registerVoiceNotices, type VoiceNotices } from "@carlnotes/core/stores/voiceNoticeStore"
import { createAudioPlayer } from "expo-audio"
import { router, usePathname } from "expo-router"
import { useEffect, useRef } from "react"
import { toSpokenAnswerPlayerAdapter } from "@/spokenAnswerAudio"
import { deleteVoiceCacheFiles, writeSpokenPartFile } from "@/voiceCacheFiles"
import { showChatNotice } from "./chatNotice"

/**
 * Owns the hosts' spoken answer player for one account, restarted for each user id. The account's end stops an answer,
 * drops its audio from memory, and deletes its files.
 */
export function SpokenAnswerAudio({ userId }: { userId: string | null }) {
	// skip Storybook, and keep the latest purchase offers in a ref that the registered notices read when one shows
	const isStorybook = usePathname() === "/storybook"
	const { canPurchase } = usePurchaseOffers()
	const canPurchaseRef = useRef(canPurchase)
	canPurchaseRef.current = canPurchase

	useEffect(() => {
		if (isStorybook) {
			return
		}

		// a crash's leftover files go at launch, and a signed-out app plays no answers
		deleteVoiceCacheFiles()
		if (!userId) {
			return
		}

		// a second player beside the podcast's, which the spoken answer store drives
		const player = createAudioPlayer(null, { updateInterval: 250 })
		const spokenAnswerAudio = toSpokenAnswerPlayerAdapter({ player, writeSpokenPartFile })
		const unregisterPlayer = registerSpokenAnswerPlayer(spokenAnswerAudio.adapter)
		const unregisterNotices = registerVoiceNotices(toAppVoiceNotices(() => canPurchaseRef.current))
		return () => {
			// stop the account's answer, drop its audio, and delete its files
			clearSpokenAnswers()
			unregisterNotices()
			unregisterPlayer()
			spokenAnswerAudio.release()
			player.remove()
			deleteVoiceCacheFiles()
		}
	}, [userId, isStorybook])
	return null
}

// the app's voice notices: the chat notice, and the spent budget's line with the web's plans action where the store
// sells the user a plan
function toAppVoiceNotices(readCanPurchase: () => boolean): VoiceNotices {
	return {
		showNotice: showChatNotice,
		showSpentBudgetNotice: () =>
			showChatNotice(
				CHAT_REJECTION_COPY.budget,
				readCanPurchase()
					? { label: PURCHASE_COPY.pickUpMoreCoffee, onPress: () => router.push(PLANS_PATH) }
					: undefined,
			),
	}
}

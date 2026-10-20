// the chat room's spoken answer: carl's reply to this browser's spoken message is spoken once, and its first spoken
// word completes the spoken question event
import { isModelChatMessage } from "@shared/chatMentions"
import type { ChatRoomMessage } from "@shared/contracts/chat"
import type { VoiceChatPage } from "@shared/payloads"
import { toSpokenParts } from "@shared/spokenText"
import { useRef } from "react"
import { type SpokenQuestionTimings, sendSpokenQuestionEvent } from "@/clients/voiceClient"
import { toChatRoomSpokenAnswerKey } from "@/stores/spokenAnswerQueue"
import { isVoiceRecordingActive, speakSpokenAnswer, stopSpokenAnswerKey } from "@/stores/spokenAnswerStore"

// the spoken message carl's reply is awaited for, and the timings its spoken question event reports
type PendingSpokenPost = { chatMessageId: number; spokenQuestionTimings: SpokenQuestionTimings }

// a posted spoken message, the timings its question event reports, and whether the budget gate rejected carl's reply
type AwaitSpokenAnswerOptions = PendingSpokenPost & { isModelReplyRejected: boolean }

// what the room hook calls: await carl's reply to a spoken message, and speak an arriving chat message if it is
// that reply
export type ChatRoomSpokenAnswer = {
	awaitSpokenAnswer: (options: AwaitSpokenAnswerOptions) => void
	speakPendingSpokenAnswer: (chatMessage: ChatRoomMessage) => void
}

/**
 * Speaks carl's reply to this browser's spoken message, once, and posts the spoken question event with the reply's
 * first spoken word.
 */
export function useChatRoomSpokenAnswer(voiceChatPage: VoiceChatPage): ChatRoomSpokenAnswer {
	// the spoken message carl's reply is awaited for, so only the asker's browser speaks the reply, once
	const pendingSpokenPostRef = useRef<PendingSpokenPost | null>(null)

	// a spoken message awaits carl's reply to speak it. a rejected one posts its question event now, with no reply
	const awaitSpokenAnswer = ({
		chatMessageId,
		spokenQuestionTimings,
		isModelReplyRejected,
	}: AwaitSpokenAnswerOptions): void => {
		// the budget gate rejected carl's reply privately, so nothing will play, and the reply that never came ends as a
		// stop under its message's key
		if (isModelReplyRejected) {
			sendSpokenQuestionEvent({ page: voiceChatPage, spokenQuestionTimings, playingAt: null })
			stopSpokenAnswerKey(toChatRoomSpokenAnswerKey(chatMessageId))
			return
		}
		pendingSpokenPostRef.current = { chatMessageId, spokenQuestionTimings }
	}

	// speak carl's reply to this browser's spoken message, once. a reconnect's replay and a teammate's reply never
	// match, and the reply's first spoken word completes the spoken question event
	const speakPendingSpokenAnswer = (chatMessage: ChatRoomMessage): void => {
		const pendingSpokenPost = pendingSpokenPostRef.current
		if (!pendingSpokenPost || !isModelReplyTo(chatMessage, pendingSpokenPost.chatMessageId)) {
			return
		}
		pendingSpokenPostRef.current = null
		const { spokenQuestionTimings } = pendingSpokenPost

		// carl's rejection of a failed turn replies without the spoken flag, and a reply that arrives while the asker
		// records a follow-up stays as text with its play button. nothing plays and the event posts now
		const spokenAnswerKey = toChatRoomSpokenAnswerKey(chatMessage.id)
		if (!chatMessage.isSpoken || isVoiceRecordingActive()) {
			sendSpokenQuestionEvent({ page: voiceChatPage, spokenQuestionTimings, playingAt: null })
			stopSpokenAnswerKey(spokenAnswerKey)
			return
		}

		// speak the whole reply, from its short first spoken part, as the conversation's own
		speakSpokenAnswer({
			spokenAnswerKey,
			page: voiceChatPage,
			spokenParts: toSpokenParts(chatMessage.content),
			isAutoPlayed: true,
			onFirstPlaying: (playingAt) => sendSpokenQuestionEvent({ page: voiceChatPage, spokenQuestionTimings, playingAt }),
		})
	}
	return { awaitSpokenAnswer, speakPendingSpokenAnswer }
}

// whether a chat message is carl's reply, spoken or his rejection, to the spoken message with this id
function isModelReplyTo(chatMessage: ChatRoomMessage, spokenChatMessageId: number): boolean {
	return chatMessage.replyToChatMessageId === spokenChatMessageId && isModelChatMessage(chatMessage)
}

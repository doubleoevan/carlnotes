// a spoken question's reply as it streams: each finished spoken part spoken as it arrives, then the rest, in the voice
// of the host who answers, with the spoken question event posted once
import type { ConversationChatTurnKind, PodcastEpisodeSpeaker } from "@shared/enums"
import type { VoiceChatPage } from "@shared/payloads"
import { toFinishedSpokenParts, toUnfinishedSpokenParts } from "@shared/spokenText"
import type { ChatSendResult } from "@/clients/chatClient"
import { type SpokenQuestionTimings, sendSpokenQuestionEvent } from "@/clients/voiceClient"
import {
	appendSpokenAnswerPart,
	completeSpokenAnswer,
	stopSpokenAnswerKey,
	toSpokenAnswerState,
} from "@/stores/spokenAnswerStore"

// what a spoken question's reply does as it streams: speak each finished spoken part, then the rest, and post the
// spoken question event once. the speaker and the lock screen may be set before the first spoken part
export type StreamedSpokenAnswer = {
	appendChunk: (answer: string) => void
	finish: (answer: string, chatSendResult: ChatSendResult) => void
	setSpeaker: (speaker: PodcastEpisodeSpeaker, mediaSessionMetadata?: MediaMetadataInit) => void
}

// the chat turn the reply fills, the page it speaks on, the spoken question's timings, where it was asked from, and
// what runs once its first word plays
export type ToStreamedSpokenAnswerOptions = {
	spokenAnswerKey: string
	page: VoiceChatPage
	spokenQuestionTimings: SpokenQuestionTimings
	chatTurnKind?: ConversationChatTurnKind
	onPlaying?: () => void
}

/**
 * Returns the streamed spoken answer of one spoken question's reply, keyed by the chat turn the reply fills. Carl
 * speaks it unless setSpeaker names another host.
 */
export function toStreamedSpokenAnswer({
	spokenAnswerKey,
	page,
	spokenQuestionTimings,
	chatTurnKind = "private",
	onPlaying,
}: ToStreamedSpokenAnswerOptions): StreamedSpokenAnswer {
	// where the next unfinished spoken part starts, whether the spoken question event posted, and whose voice speaks
	let spokenPartStart = 0
	let isQuestionEventPosted = false
	let speaker: PodcastEpisodeSpeaker = "host"
	let mediaSessionMetadata: MediaMetadataInit | undefined

	// post the spoken question event once, with the first spoken word's delay if a spoken part played, which is when
	// the host starts answering
	const postQuestionEvent = (playingAt: number | null): void => {
		if (isQuestionEventPosted) {
			return
		}
		isQuestionEventPosted = true
		sendSpokenQuestionEvent({ page, spokenQuestionTimings, playingAt, chatTurnKind })

		// a spoken part that played is the host answering
		if (playingAt !== null) {
			onPlaying?.()
		}
	}

	// append one spoken part, with the first playing reporting the event
	const speak = (text: string): void => {
		appendSpokenAnswerPart({
			spokenAnswerKey,
			page,
			text,
			speaker,
			mediaSessionMetadata,
			onFirstPlaying: postQuestionEvent,
		})
	}
	return {
		// speak the short first spoken part at its sentence end, then each paragraph as its blank line arrives
		appendChunk: (answer) => {
			const finishedSpokenParts = toFinishedSpokenParts(answer, spokenPartStart)
			spokenPartStart = finishedSpokenParts.spokenPartStart
			for (const spokenPart of finishedSpokenParts.spokenParts) {
				speak(spokenPart)
			}
		},
		// go quiet with a stopped or rejected stream, or speak the rest
		finish: (answer, chatSendResult) => {
			if (chatSendResult !== null) {
				stopSpokenAnswerKey(spokenAnswerKey)
				postQuestionEvent(null)
				return
			}

			// the unfinished tail is the last spoken part
			for (const spokenPart of toUnfinishedSpokenParts(answer, spokenPartStart)) {
				speak(spokenPart)
			}

			// a reply that queued nothing posts the event now, and a queue posts it from its first playing or its end
			completeSpokenAnswer(spokenAnswerKey)
			if (toSpokenAnswerState(spokenAnswerKey) === "idle") {
				postQuestionEvent(null)
			}
		},
		// the speaker whose voice speaks the reply, and what the lock screen shows while they do
		setSpeaker: (nextSpeaker, nextMediaSessionMetadata) => {
			speaker = nextSpeaker
			mediaSessionMetadata = nextMediaSessionMetadata
		},
	}
}

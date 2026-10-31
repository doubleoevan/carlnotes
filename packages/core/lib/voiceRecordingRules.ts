// the rules a recording decides with: whether the mic takes the send slot, the mic's label and state, its states,
// whether the timer ticks, the meter's level callback, and the rejection a spoken questions status stops a recording
// with

import type { TranscriptionRejection } from "@carlnotes/client/voiceClient"
import type { SpokenQuestionsState } from "@carlnotes/contracts/chat"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"

// what the composer shows for the recording: nothing, the microphone request, the recording bar, or the wait for
// the transcript
export type VoiceRecordingState = "idle" | "requesting" | "recording" | "transcribing"

// the label of the mic in a composer's send slot
export const MIC_BUTTON_LABEL = "Talk to Carl"

/**
 * Returns the mic's state: a spinner while the microphone is asked for or the transcript is on its way, and a ring at
 * an idle mic while listen mode waits for carl.
 */
export function toMicButtonState({ state, isListening }: { state: VoiceRecordingState; isListening: boolean }): {
	isWaiting: boolean
	isListeningForNextQuestion: boolean
} {
	return {
		isWaiting: state === "requesting" || state === "transcribing",
		isListeningForNextQuestion: isListening && state === "idle",
	}
}

// the composer's voice page, its draft, how many files it holds, and whether a send or a post is on its way
type IsMicShownOptions = {
	voiceChatPage: VoiceChatPage | null
	draft: string
	attachmentCount: number
	isBusy: boolean
}

/**
 * Returns whether the mic takes the send slot: voice is on, the box and the attachments are empty, and nothing is on its
 * way.
 */
export function isMicShown({ voiceChatPage, draft, attachmentCount, isBusy }: IsMicShownOptions): boolean {
	return voiceChatPage !== null && draft.trim() === "" && attachmentCount === 0 && !isBusy
}

// a recording's state, and whether it is a question asked from the podcast player
type IsRecordingTimerTickingOptions = { state: VoiceRecordingState; isPodcastEpisodeQuestion: boolean }

/**
 * Returns whether the seconds timer ticks, which is only while a composer records.
 */
export function isRecordingTimerTicking({ state, isPodcastEpisodeQuestion }: IsRecordingTimerTickingOptions): boolean {
	return state === "recording" && !isPodcastEpisodeQuestion
}

// the spoken questions status a reopened recording read, whether that recording is still the current one, and the
// mic's state now
type ToReopenedRecordingRejectionOptions = {
	spokenQuestionsStatus: SpokenQuestionsState["status"]
	isSameRecording: boolean
	state: VoiceRecordingState
}

/**
 * Returns the rejection that stops a reopened recording once its spoken questions read returns, or null to keep it.
 */
export function toReopenedRecordingRejection({
	spokenQuestionsStatus,
	isSameRecording,
	state,
}: ToReopenedRecordingRejectionOptions): SpokenQuestionsRejection | null {
	// a recording that already ended or gave way to a newer one is left alone
	if (!isSameRecording || state === "idle") {
		return null
	}
	return toSpokenQuestionsRejection(spokenQuestionsStatus)
}

// whether the recording is a question asked from the podcast player, and the meter's setter
type ToLevelCallbackOptions = { isPodcastEpisodeQuestion: boolean; setLevel: (meterLevel: number) => void }

/**
 * Returns the recorder's level callback, which sets a composer's meter and ignores each level for the podcast mic.
 */
export function toLevelCallback({
	isPodcastEpisodeQuestion,
	setLevel,
}: ToLevelCallbackOptions): (meterLevel: number) => void {
	return isPodcastEpisodeQuestion ? () => {} : setLevel
}

// what a spoken questions status stops a recording with: the budget rejection or the spoken questions cutoff
type SpokenQuestionsRejection = Extract<TranscriptionRejection, "budget" | "spokenQuestionsPaused">

/**
 * Returns the rejection a spoken questions status means, or null while speaking is allowed.
 */
export function toSpokenQuestionsRejection(
	spokenQuestionsStatus: SpokenQuestionsState["status"],
): SpokenQuestionsRejection | null {
	if (spokenQuestionsStatus === "allowed") {
		return null
	}
	return spokenQuestionsStatus === "budget" ? "budget" : "spokenQuestionsPaused"
}

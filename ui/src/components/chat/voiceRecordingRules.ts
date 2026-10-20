// the rules a recording decides with: its states, whether the timer ticks, the meter's level callback, and the
// rejection a spoken questions status stops a recording with
import type { SpokenQuestionsState } from "@shared/contracts/chat"
import type { TranscriptionRejection } from "@/clients/voiceClient"

// what the composer shows for the recording: nothing, the microphone request, the recording bar, or the wait for
// the transcript
export type VoiceRecordingState = "idle" | "requesting" | "recording" | "transcribing"

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

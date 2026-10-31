// the voice's part of a session's exit: a podcast question ends, the mounted recordings end, and the answer stops at
// once, and a sign-out that the server accepted drops the spoken audio from memory
import { endPodcastEpisodeQuestionOnSignOut } from "@carlnotes/core/stores/podcastEpisodeQuestionStore"
import { clearSpokenAnswers, stopSpokenAnswer } from "@carlnotes/core/stores/spokenAnswerStore"
import { toEventListeners } from "@carlnotes/core/stores/storeListeners"

// the mounted recordings' ends, which a session's exit announces
const voiceRecordingEndListeners = toEventListeners<void>()

/**
 * Subscribes a mounted recording's end, which cancels its recording and ends listen mode, and returns the call that
 * removes it.
 */
export const subscribeToVoiceRecordingEnd = voiceRecordingEndListeners.subscribe

/**
 * Starts the voice's exit: a podcast question ends without resuming the podcast episode, and the recordings end and
 * the answer stops at once. The returned call drops the spoken audio from memory once the sign-out succeeds.
 */
export function toVoiceExit(): (isSuccessful: boolean) => void {
	// the question ends first, so the recording and answer stops below never resume the podcast episode
	endPodcastEpisodeQuestionOnSignOut()
	voiceRecordingEndListeners.announce()
	stopSpokenAnswer()

	// an accepted sign-out drops the spoken audio
	return (isSuccessful) => {
		if (isSuccessful) {
			clearSpokenAnswers()
		}
	}
}

// the podcast question button for both apps: the recording options it builds, the mark every podcast mic slot reads,
// its press, and the slot's state
import { authClient } from "@carlnotes/client/authClient"
import { toVoiceChatPage } from "@carlnotes/client/voiceClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { useEffect } from "react"
import type { VoiceRecordingSession } from "../lib/voiceRecorder"
import {
	type PodcastEpisodeQuestionButtonState,
	toPodcastEpisodeQuestionButtonState,
} from "../stores/podcastEpisodeQuestionRules"
import {
	askPodcastEpisodeQuestion,
	endPodcastEpisodeQuestion,
	loadPodcastEpisodeQuestionConversation,
	markPodcastEpisodeQuestionRecording,
	sendPodcastEpisodeQuestionRecording,
	startPodcastEpisodeQuestion,
	usePodcastEpisodeQuestion,
} from "../stores/podcastEpisodeQuestionStore"
import { showSpentBudgetNotice } from "../stores/voiceNoticeStore"
import type { UseVoiceRecordingOptions, VoiceRecording } from "./useVoiceRecording"

// the options a platform's recording hook takes for a podcast question, all but its recorder and its paused action
export type PodcastEpisodeQuestionRecordingOptions = Omit<
	UseVoiceRecordingOptions<VoiceRecordingSession>,
	"recorder" | "onSpokenQuestionsPaused"
>

/**
 * Returns a podcast question's recording options. The recording loads the question's conversation before the
 * microphone is asked for, sends its transcript to the question, and stops the question if it ends with nothing sent.
 */
export function toPodcastEpisodeQuestionRecordingOptions(
	podcastEpisode: PodcastEpisode,
): PodcastEpisodeQuestionRecordingOptions {
	return {
		page: toVoiceChatPage({ topicId: podcastEpisode.topicId }),
		isPodcastEpisodeQuestion: true,
		canStartVoiceRecording: loadPodcastEpisodeQuestionConversation,
		onTranscript: (transcript, spokenQuestionTimings) =>
			void askPodcastEpisodeQuestion(transcript, spokenQuestionTimings),
		onBudgetRejected: showSpentBudgetNotice,
		onVoiceRecordingEnded: () => endPodcastEpisodeQuestion("stopped"),
	}
}

/**
 * Returns a podcast mic slot's state and its press. This mic's running recording marks the question as recording, so
 * every other podcast mic slot sends too. While the question records the press sends early. Otherwise a visitor's
 * press signs up, and a user's starts the question and the recording inside the tap's gesture.
 */
export function usePodcastEpisodeQuestionButton({
	voiceRecording,
	onSignUp,
}: {
	voiceRecording: VoiceRecording
	onSignUp: () => void
}): { buttonState: PodcastEpisodeQuestionButtonState; pressButton: () => void } {
	// the question's phase, whether any mic records it, and whether the user is signed in
	const { phase, isVoiceRecording } = usePodcastEpisodeQuestion()
	const { data: session } = authClient().useSession()

	// this mic's running recording marks the question as recording
	const isThisMicRecording = voiceRecording.state === "recording"
	useEffect(() => {
		if (!isThisMicRecording) {
			return
		}
		return markPodcastEpisodeQuestionRecording()
	}, [isThisMicRecording])

	// a mic press: a visitor signs up, and a user's tap starts the question and the recording
	function pressMic(): void {
		if (!session) {
			onSignUp()
			return
		}

		// start the question and the recording inside the tap
		if (startPodcastEpisodeQuestion(voiceRecording)) {
			voiceRecording.start()
		}
	}

	// while the question records, from this mic or another, the slot sends early
	const buttonState = toPodcastEpisodeQuestionButtonState({
		voiceRecordingState: voiceRecording.state,
		phase,
		isVoiceRecording,
	})
	return { buttonState, pressButton: buttonState === "send" ? sendPodcastEpisodeQuestionRecording : pressMic }
}

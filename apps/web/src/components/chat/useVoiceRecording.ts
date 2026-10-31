// the browser's recording: core's state machine from the mic tap to the transcript, over the browser's microphone and
// audio context, with the plans page, or a toast for a user on premium, past the spoken questions cutoff
import {
	type UseVoiceRecordingOptions,
	useVoiceRecording as useSharedVoiceRecording,
	type VoiceRecording,
} from "@carlnotes/core/hooks/useVoiceRecording"
import { toUpgradePromptCta } from "@carlnotes/core/lib/spokenQuestionsPaused"
import type { VoiceRecorderAdapter, VoiceRecordingSession } from "@carlnotes/core/lib/voiceRecorder"
import { useSpokenQuestionsPausedAction } from "./spokenQuestionsPaused"

export type { VoiceRecording } from "@carlnotes/core/hooks/useVoiceRecording"

// a browser recording's session: the audio context the tap made and resumed before the microphone was asked for
type BrowserVoiceRecordingSession = VoiceRecordingSession & { audioContext: AudioContext }

// the audio context the podcast player's first question made in its tap, kept for the page. the voice activity
// detector is made once over it, and a context made outside a tap starts suspended on iOS
let podcastEpisodeQuestionAudioContext: AudioContext | null = null

// the browser's microphone. the recorder module loads on the first tap
const browserVoiceRecorder: VoiceRecorderAdapter<BrowserVoiceRecordingSession> = {
	openSession: ({ isPodcastEpisodeQuestion }) =>
		isPodcastEpisodeQuestion ? toPodcastEpisodeQuestionSession() : toComposerSession(),
	load: async () => {
		await loadVoiceRecorder()
	},
	start: async ({ session, ...startVoiceRecordingOptions }) => {
		const { startVoiceRecording } = await loadVoiceRecorder()
		return startVoiceRecording({ ...startVoiceRecordingOptions, audioContext: session.audioContext })
	},
}

/**
 * Owns one recording, a composer's or the podcast player's, through the browser's microphone. Past the spoken
 * questions cutoff the mic opens the plans page, or toasts when speaking comes back for a user on premium.
 */
export function useVoiceRecording(
	options: Omit<UseVoiceRecordingOptions<BrowserVoiceRecordingSession>, "recorder" | "onSpokenQuestionsPaused">,
): VoiceRecording {
	// open the plans page or toast for a user on premium past the cutoff, over the browser's recorder
	const onSpokenQuestionsPaused = useSpokenQuestionsPausedAction(toUpgradePromptCta(options.isPodcastEpisodeQuestion))
	return useSharedVoiceRecording({ ...options, recorder: browserVoiceRecorder, onSpokenQuestionsPaused })
}

// the recorder module, which loads on the first recording
function loadVoiceRecorder(): Promise<typeof import("@/lib/voiceRecorder")> {
	return import("@/lib/voiceRecorder")
}

// a composer's session: its own audio context for the whole listen session, closed when listen mode ends
function toComposerSession(): BrowserVoiceRecordingSession {
	const audioContext = new AudioContext()
	return {
		audioContext,
		resume: () => void audioContext.resume(),
		suspend: () => void audioContext.suspend(),
		close: () => {
			if (audioContext.state !== "closed") {
				void audioContext.close()
			}
		},
	}
}

// the podcast player's session: the page's audio context, made in the first question's tap, suspended between
// questions, and never closed
function toPodcastEpisodeQuestionSession(): BrowserVoiceRecordingSession {
	podcastEpisodeQuestionAudioContext ??= new AudioContext()
	const audioContext = podcastEpisodeQuestionAudioContext
	return {
		audioContext,
		resume: () => void audioContext.resume(),
		suspend: () => void audioContext.suspend(),
		close: () => {},
	}
}

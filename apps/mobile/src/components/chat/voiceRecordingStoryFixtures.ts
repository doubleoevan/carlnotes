// a voice recording for the voice control stories, idle and silent unless a story says otherwise

import type { VoiceRecording } from "./useVoiceRecording"

/**
 * Returns a voice recording in the given state whose actions do nothing.
 */
export function toStoryVoiceRecording(overrides: Partial<VoiceRecording> = {}): VoiceRecording {
	return {
		state: "idle",
		isListening: false,
		level: 0,
		secondsElapsed: 0,
		start: () => {},
		send: () => {},
		cancel: () => {},
		stopListening: () => {},
		leave: () => {},
		...overrides,
	}
}

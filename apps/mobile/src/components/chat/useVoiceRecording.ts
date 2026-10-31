// the phone's recording: core's state machine from the mic tap to the transcript, over the phone's microphone, with
// the line that says when speaking comes back past the spoken questions cutoff
import {
	type UseVoiceRecordingOptions,
	useVoiceRecording as useSharedVoiceRecording,
	type VoiceRecording,
} from "@carlnotes/core/hooks/useVoiceRecording"
import { PREMIUM_PLAN_PROMPTS, toUpgradePromptCta } from "@carlnotes/core/lib/spokenQuestionsPaused"
import type { VoiceRecordingSession } from "@carlnotes/core/lib/voiceRecorder"
import { showVoiceNotice } from "@carlnotes/core/stores/voiceNoticeStore"
import {
	AudioModule,
	getRecordingPermissionsAsync,
	type RecordingOptions,
	requestRecordingPermissionsAsync,
} from "expo-audio"
import { useFocusEffect } from "expo-router"
import { useCallback, useRef } from "react"
import { AppState, Linking } from "react-native"
import { deleteCacheFile } from "@/cacheFiles"
import { MOBILE_PLATFORM } from "@/deviceTelemetry"
import { setIsRecordingAudioMode } from "@/voiceAudioMode"
import { requestMicrophonePermission } from "@/voicePermission"
import { toVoiceRecorderAdapter } from "@/voiceRecorder"
import { subscribeToVoiceRecordingEnd } from "@/voiceSession"

export type { VoiceRecording } from "@carlnotes/core/hooks/useVoiceRecording"

// the phone's microphone, one native recorder per recording. the native constructor takes the options already
// flattened for the platform. a development build logs each recording's levels
const appVoiceRecorder = toVoiceRecorderAdapter({
	platform: MOBILE_PLATFORM,
	createRecorder: (options) => new AudioModule.AudioRecorder(options as Partial<RecordingOptions>),
	requestMicrophone: () =>
		requestMicrophonePermission({
			getPermission: getRecordingPermissionsAsync,
			requestPermission: requestRecordingPermissionsAsync,
		}),
	setIsRecordingAudioMode,
	deleteFile: deleteCacheFile,
	openSettings: () => void Linking.openSettings(),
	subscribeToBackground: subscribeToBackgroundAndSessionExit,
	traceLevel: __DEV__ ? (voiceLevelTrace) => console.info("voice level trace", voiceLevelTrace) : undefined,
})

/**
 * Owns one recording, a composer's or the podcast player's, through the phone's microphone. Past the spoken questions
 * cutoff the mic says when speaking comes back on every plan.
 */
export function useVoiceRecording(
	options: Omit<UseVoiceRecordingOptions<VoiceRecordingSession>, "recorder" | "onSpokenQuestionsPaused">,
): VoiceRecording {
	const upgradePromptCta = toUpgradePromptCta(options.isPodcastEpisodeQuestion)
	return useSharedVoiceRecording({
		...options,
		recorder: appVoiceRecorder,
		onSpokenQuestionsPaused: () => showVoiceNotice(PREMIUM_PLAN_PROMPTS[upgradePromptCta]),
	})
}

/**
 * Leaves a composer's recording and listen mode once its chat screen loses focus, so the mic never opens again under a
 * screen pushed on top. The app leaving for the background is the recorder's own rule.
 */
export function useLeaveVoiceRecordingOnBlur(voiceRecording: VoiceRecording): void {
	// leave with the latest recording's state once the screen blurs
	const leaveRef = useRef(voiceRecording.leave)
	leaveRef.current = voiceRecording.leave
	useFocusEffect(useCallback(() => () => leaveRef.current(), []))
}

// what ends a recording and listen mode: the app leaving for the background, and a session's exit. iOS's inactive
// state is skipped. the microphone prompt itself makes the app inactive
function subscribeToBackgroundAndSessionExit(listener: () => void): () => void {
	const unsubscribeFromSessionExit = subscribeToVoiceRecordingEnd(listener)
	const subscription = AppState.addEventListener("change", (appState) => {
		if (appState === "background") {
			listener()
		}
	})

	// remove both
	return () => {
		unsubscribeFromSessionExit()
		subscription.remove()
	}
}

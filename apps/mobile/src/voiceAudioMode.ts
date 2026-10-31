// the app's one audio mode, which the podcast player and the voice recorder share: playback in silent mode and in the
// background, pausing other apps' audio, with the microphone allowed only while a recording runs
import { setAudioModeAsync } from "expo-audio"

// the playback values that every switch keeps. recording never continues in the background
const PLAYBACK_AUDIO_MODE = {
	playsInSilentMode: true,
	shouldPlayInBackground: true,
	interruptionMode: "doNotMix",
	allowsBackgroundRecording: false,
} as const

/**
 * Sets the app's audio mode, allowing the microphone only for a recording. iOS plays a spoken answer and the podcast
 * episode on the playback category again once the recording ends, so Bluetooth plays them in stereo.
 */
export function setIsRecordingAudioMode(isRecording: boolean): Promise<void> {
	return setAudioModeAsync({ ...PLAYBACK_AUDIO_MODE, allowsRecording: isRecording })
}

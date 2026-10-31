// the voice recorder each platform supplies: the session listen mode holds between recordings, a recording's
// callbacks, the running recording's controls, and the notice a rejected microphone request offers
import type { VoiceRecordingBody } from "@carlnotes/client/voiceClient"

// why a recording was cancelled: nothing rose above the silence threshold, the page or the app left the foreground,
// the platform stopped the recorder for a call or a route change, or the user cancelled it
export type VoiceRecordingCancelReason = "noSpeech" | "hidden" | "interrupted" | "user"

// how a recording ended: sent, or cancelled for a reason
export type VoiceRecordingEnd = "send" | VoiceRecordingCancelReason

// the running recording's controls: send it early, or cancel it
export type VoiceRecordingHandle = {
	send: () => void
	cancel: () => void
}

// the session a tap opens a recording on, which listen mode holds between recordings and the podcast player keeps for
// the page
export type VoiceRecordingSession = {
	resume: () => void
	suspend: () => void
	close: () => void
}

// an action a voice notice offers beside its line, like the phone's settings for a rejected microphone request
export type VoiceNoticeAction = { label: string; onPress: () => void }

export type StartVoiceRecordingOptions<Session extends VoiceRecordingSession> = {
	// the session the tap opened and resumed before the microphone was asked for
	session: Session
	// what ends the speech: the level's silence, or the browser's voice activity detector once it loads
	endOfSpeech: "level" | "voiceActivity"
	// the meter's fill, 0 to 1 in steps of a twentieth, each time the step changes
	onLevel: (meterLevel: number) => void
	// the recording and how many seconds it recorded, once it is sent
	onFinished: (recording: VoiceRecordingBody, secondsRecorded: number) => void
	onCancelled: (reason: VoiceRecordingCancelReason) => void
}

/**
 * The platform's recorder: it opens a tap's session, loads, records the microphone until the silence rules or a
 * control end it, and reports how it ended.
 */
export type VoiceRecorderAdapter<Session extends VoiceRecordingSession = VoiceRecordingSession> = {
	// the session a tap opens, made inside the tap's gesture
	openSession: (options: { isPodcastEpisodeQuestion: boolean }) => Session
	// load the recorder, which the first tap starts beside its gate. a failed load throws
	load?: () => Promise<void>
	// ask for the microphone and record it. throws if the microphone request is denied or it cannot record
	start: (options: StartVoiceRecordingOptions<Session>) => Promise<VoiceRecordingHandle>
	// drop a finished recording once its post ended, however it ended
	deleteRecording?: (recording: VoiceRecordingBody) => void
	// the action a rejected microphone request's notice offers, if the platform has one for this rejection
	toMicrophoneRejectedAction?: (error: unknown) => VoiceNoticeAction | undefined
	// call the listener each time the app leaves the foreground, and return the unsubscribe call
	subscribeToBackground?: (listener: () => void) => () => void
}

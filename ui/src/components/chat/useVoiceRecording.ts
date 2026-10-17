// a composer's recording: the state machine from the mic tap to the transcript, listen mode, which reopens the mic
// once carl finishes his spoken answer, the toasts, and the timings the spoken question event reports
import type { VoiceChatPage } from "@shared/payloads"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { type SpokenQuestionTimings, sendTranscription } from "@/clients/voiceClient"
import { CHAT_REJECTION_COPY } from "@/components/chat/chatRejectionCopy"
import type { VoiceRecordingHandle } from "@/lib/voiceRecorder"
import { pausePodcastEpisode } from "@/stores/podcastEpisodePlayerStore"
import {
	playSpokenAnswerSilence,
	type SpokenAnswerEnd,
	setIsVoiceRecordingActive,
	stopSpokenAnswer,
	subscribeToSpokenAnswerEnd,
} from "@/stores/spokenAnswerStore"

// what the composer shows for the recording: nothing, the microphone request, the recording bar, or the wait for
// the transcript
export type VoiceRecordingState = "idle" | "requesting" | "recording" | "transcribing"

// listen mode, which a mic tap starts: off, listening while the mic is open or the transcript is on its way, or
// waiting for carl to finish his spoken answer, after which the mic reopens on its own
export type ListenMode = "off" | "listening" | "waiting"

// the toasts: the browser rejected the microphone request, no speech was recorded or transcribed, and the transcription
// failed. the in-chat failure notice has its own retry button, so only the toast asks for another try
export const MICROPHONE_REJECTED_TOAST = "Carl can't hear you. Type it, he reads fast."
export const NO_SPEECH_TOAST = "Carl didn't catch that. Please try again."
export const TRANSCRIPTION_FAILED_TOAST = `${CHAT_REJECTION_COPY.failed} Please try again.`

// how often the timer re-renders
const TIMER_TICK_MS = 1_000

// how long listen mode waits for carl's spoken answer to end before it gives up
const LISTEN_WAIT_TIMEOUT_MS = 2 * 60 * 1_000

export type VoiceRecording = {
	state: VoiceRecordingState
	// whether listen mode is on, so the mic reopens on its own once carl finishes talking
	isListening: boolean
	// the meter's fill, 0 to 1 in steps of a twentieth
	level: number
	// how long the recording has run, for the timer
	secondsElapsed: number
	// start a recording from the mic tap, send it early, cancel it, or end listen mode
	start: () => void
	send: () => void
	cancel: () => void
	stopListening: () => void
}

// the recording to transcribe, how long it ran, and the page it posts for
type TranscribeOptions = { recording: Blob; secondsRecorded: number; page: VoiceChatPage }

type UseVoiceRecordingOptions = {
	// the page the transcription posts for, null while voice is off and the mic never renders
	page: VoiceChatPage | null
	// what the composer sends once the transcript returns
	onTranscript: (transcript: string, timings: SpokenQuestionTimings) => void
	// shows a spent budget in the composer's own way. without it, the rejection toasts
	onBudgetRejected?: () => void
}

/**
 * Owns one composer's recording and its listen mode: the mic tap asks for the microphone and shows the bar, the
 * recording sends itself once the speaker stops, the transcript reaches the composer through onTranscript, and the
 * mic reopens once carl finishes his spoken answer, until the speaker stays quiet or cancels.
 */
export function useVoiceRecording({ page, onTranscript, onBudgetRejected }: UseVoiceRecordingOptions): VoiceRecording {
	// the recording's state, listen mode, and the bar's meter and timer
	const [state, setState] = useState<VoiceRecordingState>("idle")
	const [listenMode, setListenMode] = useState<ListenMode>("off")
	const [level, setLevel] = useState(0)
	const [secondsElapsed, setSecondsElapsed] = useState(0)

	// the running recording's controls, the states the callbacks read at once, and whether the composer is mounted
	const recordingRef = useRef<VoiceRecordingHandle | null>(null)
	const stateRef = useRef<VoiceRecordingState>("idle")
	const listenModeRef = useRef<ListenMode>("off")
	const isMountedRef = useRef(true)

	// the listen session's audio context, made in the first tap so a reopened mic needs no gesture, whether the
	// running recording was reopened by listen mode, and the wait for carl's reply to end
	const audioContextRef = useRef<AudioContext | null>(null)
	const isReopenedRef = useRef(false)
	const waitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// the latest options, so the recorder's callbacks never read a stale page or composer callback
	const optionsRef = useRef({ page, onTranscript, onBudgetRejected })
	optionsRef.current = { page, onTranscript, onBudgetRejected }

	// the latest end-of-reply handler and stop, which the store's listener and the unmount call
	const handleSpokenAnswerEndRef = useRef(handleSpokenAnswerEnd)
	handleSpokenAnswerEndRef.current = handleSpokenAnswerEnd
	const stopListeningRef = useRef(stopListening)
	stopListeningRef.current = stopListening

	// the timer ticks once a second while recording
	useEffect(() => {
		if (state !== "recording") {
			return
		}

		// count the seconds from the recording's start, and stop with it
		const startedAt = Date.now()
		setSecondsElapsed(0)
		const timer = setInterval(() => setSecondsElapsed(Math.floor((Date.now() - startedAt) / 1000)), TIMER_TICK_MS)
		return () => clearInterval(timer)
	}, [state])

	// a composer that unmounts under a recording cancels it and ends listen mode, so the microphone never stays open
	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
			stopListeningRef.current()
		}
	}, [])

	// listen mode reopens the mic once carl's spoken answer ends
	useEffect(
		() => subscribeToSpokenAnswerEnd((spokenAnswerEnd) => handleSpokenAnswerEndRef.current(spokenAnswerEnd)),
		[],
	)

	// set the state for the tap, for the render, and for the spoken answer store
	function changeState(nextState: VoiceRecordingState): void {
		stateRef.current = nextState
		setState(nextState)
		setIsVoiceRecordingActive(nextState !== "idle")
	}

	// set listen mode for the callbacks and for the render
	function changeListenMode(nextListenMode: ListenMode): void {
		listenModeRef.current = nextListenMode
		setListenMode(nextListenMode)
	}

	// end listen mode, drop the wait, and close the session's audio context
	function endListening(): void {
		clearWaitTimeout()
		changeListenMode("off")
		isReopenedRef.current = false

		// the session's context closes with it
		const audioContext = audioContextRef.current
		audioContextRef.current = null
		if (audioContext && audioContext.state !== "closed") {
			void audioContext.close()
		}
	}

	// wait for carl's reply to end, and give up after the timeout
	function startWaitTimeout(): void {
		clearWaitTimeout()
		waitTimeoutRef.current = setTimeout(() => {
			if (listenModeRef.current === "waiting") {
				endListening()
			}
		}, LISTEN_WAIT_TIMEOUT_MS)
	}

	// drop the wait, if one is running
	function clearWaitTimeout(): void {
		if (waitTimeoutRef.current) {
			clearTimeout(waitTimeoutRef.current)
			waitTimeoutRef.current = null
		}
	}

	// carl's reply ended. his own reply finishing reopens the mic, a stopped reply ends listen mode, and a reply played
	// by its button changes nothing
	function handleSpokenAnswerEnd({ isPlayedToEnd, isAutoPlayed }: SpokenAnswerEnd): void {
		if (listenModeRef.current !== "waiting") {
			return
		}

		// a stopped reply means the user wants out
		if (!isPlayedToEnd) {
			endListening()
			return
		}

		// a reply the user played by its button changes nothing, and carl's own reply finishing means it is their turn
		if (!isAutoPlayed) {
			return
		}
		reopen()
	}

	// reopen the mic on the session's audio context, with no tap and no prompt
	function reopen(): void {
		// a mic that is busy, a page with voice off, a closed session, or an unmounted composer ends listen mode instead
		const { page: voiceChatPage } = optionsRef.current
		const audioContext = audioContextRef.current
		if (stateRef.current !== "idle" || !voiceChatPage || !audioContext || !isMountedRef.current) {
			endListening()
			return
		}

		// the mic opens again as a reopened recording, so its silence ends the session quietly
		clearWaitTimeout()
		changeListenMode("listening")
		isReopenedRef.current = true
		changeState("requesting")
		void audioContext.resume()
		void record(audioContext, voiceChatPage)
	}

	// post the recording, then send the transcript, or say why there is none
	async function transcribe({ recording, secondsRecorded, page: voiceChatPage }: TranscribeOptions): Promise<void> {
		// the bar gives way to the spinner while the transcript is on its way
		recordingRef.current = null
		changeState("transcribing")
		const recordingSentAt = Date.now()
		const sendTranscriptionResult = await sendTranscription({ page: voiceChatPage, recording })
		changeState("idle")

		// a composer that unmounted while the transcript was on its way sends nothing
		if (!isMountedRef.current) {
			return
		}

		// a rejection says why in the chat's words and ends listen mode. a spent budget shows the composer's own
		// notice if it has one
		if (typeof sendTranscriptionResult === "string") {
			endListening()
			if (sendTranscriptionResult === "budget" && optionsRef.current.onBudgetRejected) {
				optionsRef.current.onBudgetRejected()
				return
			}

			// every other rejection toasts, and a failed transcription asks for another try
			toast(
				sendTranscriptionResult === "failed"
					? TRANSCRIPTION_FAILED_TOAST
					: CHAT_REJECTION_COPY[sendTranscriptionResult],
			)
			return
		}

		// an empty transcript sends nothing and ends listen mode
		const transcript = sendTranscriptionResult.transcript.trim()
		if (transcript === "") {
			endListening()
			toast(NO_SPEECH_TOAST)
			return
		}

		// the transcript sends, and listen mode waits for carl's reply to end
		if (listenModeRef.current === "listening") {
			changeListenMode("waiting")
			startWaitTimeout()
		}
		optionsRef.current.onTranscript(transcript, {
			secondsRecorded,
			transcriptionMs: Date.now() - recordingSentAt,
			recordingSentAt,
		})
	}

	// load the recorder, then ask for the microphone. a failed load or a rejected request leaves the composer as it was
	async function record(audioContext: AudioContext, voiceChatPage: VoiceChatPage): Promise<void> {
		try {
			const { startVoiceRecording } = await import("@/lib/voiceRecorder")
			const voiceRecordingHandle = await startVoiceRecording({
				audioContext,
				onLevel: setLevel,
				onFinished: (recording, secondsRecorded) =>
					void transcribe({ recording, secondsRecorded, page: voiceChatPage }),
				onCancelled: (reason) => {
					// every cancel ends listen mode. silence on a tapped recording says so, and silence on a reopened
					// one is the speaker being done
					const isReopened = isReopenedRef.current
					recordingRef.current = null
					changeState("idle")
					endListening()
					if (reason === "noSpeech" && !isReopened) {
						toast(NO_SPEECH_TOAST)
					}
				},
			})

			// a composer that unmounted while the microphone was asked for lets it go again
			if (!isMountedRef.current) {
				voiceRecordingHandle.cancel()
				return
			}

			// the bar replaces the box
			recordingRef.current = voiceRecordingHandle
			changeState("recording")
		} catch {
			// the recorder failed to load or the browser rejected the microphone request
			changeState("idle")
			endListening()
			toast(MICROPHONE_REJECTED_TOAST)
		}
	}

	// the mic tap, which starts listen mode
	function start(): void {
		const { page: voiceChatPage } = optionsRef.current
		if (stateRef.current !== "idle" || voiceChatPage === null) {
			return
		}

		// one voice at a time. stopping carl ends an earlier listen session before this tap starts its own
		stopSpokenAnswer()
		pausePodcastEpisode()
		changeState("requesting")
		changeListenMode("listening")
		isReopenedRef.current = false

		// play silence through the element and make the context inside the tap's gesture, before the recorder's async load.
		// the context serves the whole listen session
		playSpokenAnswerSilence()
		const audioContext = new AudioContext()
		audioContextRef.current = audioContext
		void audioContext.resume()
		void record(audioContext, voiceChatPage)
	}

	// the bar's send control sends early. the tap plays silence again for the reply
	function send(): void {
		playSpokenAnswerSilence()
		recordingRef.current?.send()
	}

	// end listen mode, which a typed send does, and cancel a recording that is running
	function stopListening(): void {
		endListening()
		recordingRef.current?.cancel()
	}

	// the recording's state and controls, with listen mode as one flag
	return {
		state,
		isListening: listenMode !== "off",
		level,
		secondsElapsed,
		start,
		send,
		cancel: () => recordingRef.current?.cancel(),
		stopListening,
	}
}

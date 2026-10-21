// a recording from a chat composer or the podcast player: the state machine from the mic tap to the transcript, the
// toasts, the timings the spoken question event reports, and a composer's listen mode through useListenMode. the
// rules it decides with are in voiceRecordingRules

import {
	fetchSpokenQuestionsStatus,
	type SpokenQuestionTimings,
	sendTranscription,
	type TranscriptionRejection,
} from "@carlnotes/client/voiceClient"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { VoiceRecordingHandle } from "@/lib/voiceRecorder"
import { pausePodcastEpisode } from "@/stores/podcastEpisodePlayerStore"
import { endPodcastEpisodeQuestion } from "@/stores/podcastEpisodeQuestionStore"
import { playSpokenAnswerSilence, setIsVoiceRecordingActive, stopSpokenAnswer } from "@/stores/spokenAnswerStore"
import { MICROPHONE_REJECTED_TOAST, NO_SPEECH_TOAST, toastChatRejection } from "./chatRejectionCopy"
import { useSpokenQuestionsPausedAction } from "./spokenQuestionsPaused"
import { useListenMode } from "./useListenMode"
import {
	isRecordingTimerTicking,
	toLevelCallback,
	toReopenedRecordingRejection,
	toSpokenQuestionsRejection,
	type VoiceRecordingState,
} from "./voiceRecordingRules"

// how often the timer re-renders
const TIMER_TICK_MS = 1_000

// the audio context the podcast player's first question made in its tap, kept for the page. the voice activity
// detector is made once over it, and a context made outside a tap starts suspended on iOS
let podcastEpisodeQuestionAudioContext: AudioContext | null = null

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

// the audio context and page a tapped recording opens on, its start count, and the mic's gate if it has one
type PrepareAndRecordOptions = {
	audioContext: AudioContext
	voiceChatPage: VoiceChatPage
	startCount: number
	canStartVoiceRecording?: () => Promise<boolean>
}

type UseVoiceRecordingOptions = {
	// the page the transcription posts for, null while voice is off and the mic never renders
	page: VoiceChatPage | null
	// what the composer sends once the transcript returns
	onTranscript: (transcript: string, timings: SpokenQuestionTimings) => void
	// shows a spent budget in the composer's own way. without it, the rejection toasts
	onBudgetRejected?: () => void
	// a question asked from the podcast player: it ends on the voice activity detector, has no listen mode, and keeps
	// the page's audio context. a chat composer's recording ends a podcast player question instead
	isPodcastEpisodeQuestion?: boolean
	// what runs in the tap before the microphone is asked for, returning false to stop there with nothing recorded
	canStartVoiceRecording?: () => Promise<boolean>
	// a recording that ended with no transcript sent: cancelled, silent, rejected, empty, or stopped before it started
	onVoiceRecordingEnded?: () => void
}

/**
 * Owns one recording, a composer's or the podcast player's: the mic tap asks for the microphone and shows the bar, the
 * recording sends itself once the user stops, and the transcript arrives through onTranscript. A composer's mic
 * reopens once carl finishes his spoken answer, until the user stays quiet or cancels.
 */
export function useVoiceRecording({
	page,
	onTranscript,
	onBudgetRejected,
	isPodcastEpisodeQuestion = false,
	canStartVoiceRecording,
	onVoiceRecordingEnded,
}: UseVoiceRecordingOptions): VoiceRecording {
	// the recording's state, listen mode, and the bar's meter and timer
	const [state, setState] = useState<VoiceRecordingState>("idle")
	const listenModeSession = useListenMode(reopen)
	const [level, setLevel] = useState(0)
	const [secondsElapsed, setSecondsElapsed] = useState(0)

	// the running recording's controls, the states the callbacks read at once, and whether the composer is mounted
	const recordingRef = useRef<VoiceRecordingHandle | null>(null)
	const stateRef = useRef<VoiceRecordingState>("idle")
	const isMountedRef = useRef(true)

	// a count of the recordings started, so a gate result or a microphone that arrives for an earlier one is ignored
	const startCountRef = useRef(0)

	// what the mic does past the spoken questions cutoff
	const runSpokenQuestionsPausedAction = useSpokenQuestionsPausedAction(
		isPodcastEpisodeQuestion ? "podcast-question" : "chat-voice",
	)

	// the latest options, so the recorder's callbacks never read a stale page or composer callback
	const optionsRef = useRef({ page, onTranscript, onBudgetRejected, canStartVoiceRecording, onVoiceRecordingEnded })
	optionsRef.current = { page, onTranscript, onBudgetRejected, canStartVoiceRecording, onVoiceRecordingEnded }

	// the latest stop and cancel, which the unmount calls
	const stopListeningRef = useRef(stopListening)
	stopListeningRef.current = stopListening
	const cancelRef = useRef(cancel)
	cancelRef.current = cancel

	// the timer ticks once a second while a composer records
	useEffect(() => {
		if (!isRecordingTimerTicking({ state, isPodcastEpisodeQuestion })) {
			return
		}

		// count the seconds from the recording's start, and stop with it
		const startedAt = Date.now()
		setSecondsElapsed(0)
		const timer = setInterval(() => setSecondsElapsed(Math.floor((Date.now() - startedAt) / 1000)), TIMER_TICK_MS)
		return () => clearInterval(timer)
	}, [state, isPodcastEpisodeQuestion])

	// a composer or a podcast mic that unmounts under a recording cancels it and ends listen mode, so the microphone
	// never stays open. a recording still waiting on its gate or its transcript ends as a cancel does
	useEffect(() => {
		isMountedRef.current = true
		return () => {
			// end what is pending, then the listen session and any running recording
			isMountedRef.current = false
			if (stateRef.current === "requesting" || stateRef.current === "transcribing") {
				cancelRef.current()
			}
			stopListeningRef.current()
		}
	}, [])

	// set the state for the tap, for the render, and for the spoken answer store
	function changeState(nextState: VoiceRecordingState): void {
		stateRef.current = nextState
		setState(nextState)
		setIsVoiceRecordingActive(nextState !== "idle")
	}

	// end a recording with no transcript sent. the mic goes idle, the podcast player's audio is suspended, listen mode
	// ends, and onVoiceRecordingEnded runs
	function endWithoutTranscript(): void {
		suspendPodcastEpisodeQuestionAudio()
		changeState("idle")
		listenModeSession.endListening()
		optionsRef.current.onVoiceRecordingEnded?.()
	}

	// end a rejected recording and say why in the chat's words. the spoken questions cutoff runs the paused action
	function endWithRejection(rejection: TranscriptionRejection): void {
		endWithoutTranscript()
		if (rejection === "spokenQuestionsPaused") {
			runSpokenQuestionsPausedAction()
			return
		}

		// a spent budget shows the composer's own notice if it has one, and every other rejection toasts
		toastChatRejection(rejection, optionsRef.current.onBudgetRejected)
	}

	// reopen the mic on the session's audio context, with no tap and no prompt
	function reopen(): void {
		// a mic that is busy, a page with voice off, a closed session, or an unmounted composer ends listen mode instead
		const { page: voiceChatPage } = optionsRef.current
		const audioContext = listenModeSession.getAudioContext()
		if (stateRef.current !== "idle" || !voiceChatPage || !audioContext || !isMountedRef.current) {
			listenModeSession.endListening()
			return
		}

		// the mic opens again at once as a reopened recording, so the first words are kept and its silence ends the
		// session quietly. the spoken questions read runs beside it
		listenModeSession.reopenListening()
		changeState("requesting")
		void audioContext.resume()
		startCountRef.current += 1
		void record(audioContext, voiceChatPage, startCountRef.current)
		void stopReopenedRecordingIfRejected(startCountRef.current)
	}

	// a spent budget or the spoken questions cutoff that the read returns while the reopened recording still runs
	// cancels it, so nothing is transcribed
	async function stopReopenedRecordingIfRejected(startCount: number): Promise<void> {
		const spokenQuestionsRejection = toReopenedRecordingRejection({
			spokenQuestionsStatus: await fetchSpokenQuestionsStatus(),
			isSameRecording: startCount === startCountRef.current,
			state: stateRef.current,
		})
		if (!spokenQuestionsRejection) {
			return
		}

		// the recording is released with its callbacks quiet, then ends as a rejected tap does
		startCountRef.current += 1
		recordingRef.current?.cancel()
		recordingRef.current = null
		endWithRejection(spokenQuestionsRejection)
	}

	// post the recording, then send the transcript, or say why there is none
	async function transcribe({ recording, secondsRecorded, page: voiceChatPage }: TranscribeOptions): Promise<void> {
		// the bar gives way to the spinner while the transcript is on its way
		recordingRef.current = null
		changeState("transcribing")
		const recordingSentAt = Date.now()
		const startCount = startCountRef.current
		const sendTranscriptionResult = await sendTranscription({ page: voiceChatPage, recording })

		// a transcript for a recording cancelled while it was on its way sends nothing, and leaves the newer state alone
		if (startCount !== startCountRef.current) {
			return
		}

		// set the mic idle, and a composer that unmounted while the transcript was on its way sends nothing
		changeState("idle")
		if (!isMountedRef.current) {
			return
		}

		// a rejection says why in the chat's words and ends listen mode
		if (typeof sendTranscriptionResult === "string") {
			endWithRejection(sendTranscriptionResult)
			return
		}

		// an empty transcript sends nothing and ends listen mode
		const transcript = sendTranscriptionResult.transcript.trim()
		if (transcript === "") {
			endWithoutTranscript()
			toast(NO_SPEECH_TOAST)
			return
		}

		// the transcript sends, and listen mode waits for carl's reply to end
		listenModeSession.waitForSpokenAnswer()
		optionsRef.current.onTranscript(transcript, {
			secondsRecorded,
			transcriptionMs: Date.now() - recordingSentAt,
			recordingSentAt,
		})
	}

	// load the recorder, then ask for the microphone. a failed load or a rejected request leaves the composer as it was
	async function record(audioContext: AudioContext, voiceChatPage: VoiceChatPage, startCount: number): Promise<void> {
		// a microphone that opens for an earlier recording is released with its callbacks quiet
		let isMicrophoneReleased = false
		const isCurrentRecording = (): boolean => !isMicrophoneReleased && startCount === startCountRef.current
		try {
			// the recorder loads on the first tap, and a recording cancelled while it loaded never asks for the microphone
			const { startVoiceRecording } = await loadVoiceRecorder()
			if (!isCurrentRecording() || !isMountedRef.current) {
				return
			}
			const voiceRecordingHandle = await startVoiceRecording({
				audioContext,
				endOfSpeech: isPodcastEpisodeQuestion ? "voiceActivity" : "level",
				onLevel: toLevelCallback({ isPodcastEpisodeQuestion, setLevel }),
				onFinished: (recording, secondsRecorded) => {
					if (!isCurrentRecording()) {
						return
					}
					suspendPodcastEpisodeQuestionAudio()
					void transcribe({ recording, secondsRecorded, page: voiceChatPage })
				},
				onCancelled: (reason) => {
					if (!isCurrentRecording()) {
						return
					}
					// every cancel ends listen mode. silence on a tapped recording says so, and silence on a reopened
					// one is the user being done
					const isReopened = listenModeSession.isReopened()
					recordingRef.current = null
					endWithoutTranscript()
					if (reason === "noSpeech" && !isReopened) {
						toast(NO_SPEECH_TOAST)
					}
				},
			})

			// a composer that unmounted, a recording cancelled, or a newer recording started while the microphone was asked
			// for releases it again
			if (!isMountedRef.current || !isCurrentRecording() || stateRef.current !== "requesting") {
				isMicrophoneReleased = true
				voiceRecordingHandle.cancel()
				return
			}

			// the bar replaces the box
			recordingRef.current = voiceRecordingHandle
			changeState("recording")
		} catch {
			// the recorder failed to load or the browser rejected the microphone request, for this recording alone
			if (!isCurrentRecording()) {
				return
			}
			endWithoutTranscript()
			toast(MICROPHONE_REJECTED_TOAST)
		}
	}

	// a podcast player question's audio context is suspended between questions, and the next tap resumes it
	function suspendPodcastEpisodeQuestionAudio(): void {
		if (isPodcastEpisodeQuestion) {
			void podcastEpisodeQuestionAudioContext?.suspend()
		}
	}

	// the mic tap, which starts listen mode in a composer
	function start(): void {
		const { page: voiceChatPage } = optionsRef.current
		if (stateRef.current !== "idle" || voiceChatPage === null) {
			return
		}

		// one voice at a time. stopping carl ends an earlier listen session before this tap starts its own, and a chat
		// recording ends a question asked from the podcast player, which leaves the podcast episode paused
		if (!isPodcastEpisodeQuestion) {
			endPodcastEpisodeQuestion("chatMic")
		}
		stopSpokenAnswer()
		pausePodcastEpisode()
		changeState("requesting")

		// play silence through the element and make or resume the context inside the tap's gesture, before the recorder's
		// async load. a composer's context serves its whole listen session, and the podcast player's the whole page
		playSpokenAnswerSilence()
		const audioContext = isPodcastEpisodeQuestion ? toPodcastEpisodeQuestionAudioContext() : new AudioContext()
		listenModeSession.startListening(isPodcastEpisodeQuestion ? null : audioContext)
		void audioContext.resume()
		startCountRef.current += 1
		const { canStartVoiceRecording } = optionsRef.current
		void prepareAndRecord({ audioContext, voiceChatPage, startCount: startCountRef.current, canStartVoiceRecording })
	}

	// run the tap's gate and read the spoken questions state before the microphone while the recorder loads, then
	// record, or stop with nothing recorded
	async function prepareAndRecord({
		audioContext,
		voiceChatPage,
		startCount,
		canStartVoiceRecording,
	}: PrepareAndRecordOptions): Promise<void> {
		// the recorder loads beside the gate and the read. a failed load shows once record loads it again
		void loadVoiceRecorder().catch(() => null)

		// a recording cancelled while its gate or the spoken questions read ran stops here, and leaves a newer recording
		// alone. a gate that fails says no
		const [isVoiceRecordingAllowed, spokenQuestionsStatus] = await Promise.all([
			canStartVoiceRecording ? canStartVoiceRecording().catch(() => false) : true,
			fetchSpokenQuestionsStatus(),
		])
		if (startCount !== startCountRef.current) {
			return
		}

		// a gate that said no already said why, so it ends the tap with nothing recorded
		if (!isVoiceRecordingAllowed) {
			endWithoutTranscript()
			return
		}

		// a spent budget shows the budget rejection as a transcription's does, and the spoken questions cutoff runs the
		// paused action, with nothing recorded
		const spokenQuestionsRejection = toSpokenQuestionsRejection(spokenQuestionsStatus)
		if (spokenQuestionsRejection) {
			endWithRejection(spokenQuestionsRejection)
			return
		}

		// the microphone, once the gate and the read are done, unless the recording was cancelled or the composer left
		// meanwhile
		if (stateRef.current === "requesting" && isMountedRef.current) {
			await record(audioContext, voiceChatPage, startCount)
		}
	}

	// the bar's send control sends early. the tap plays silence again for the reply
	function send(): void {
		playSpokenAnswerSilence()
		recordingRef.current?.send()
	}

	// cancel a recording that is running, one whose microphone is still being asked for, or one being transcribed
	function cancel(): void {
		if (stateRef.current !== "requesting" && stateRef.current !== "transcribing") {
			recordingRef.current?.cancel()
			return
		}

		// a microphone still being asked for is released once it opens, and a pending gate result or transcript is ignored
		startCountRef.current += 1
		endWithoutTranscript()
	}

	// end listen mode, which a typed send does, and cancel a recording that is running
	function stopListening(): void {
		listenModeSession.endListening()
		recordingRef.current?.cancel()
	}

	// the recording's state and controls, with listen mode as one flag
	return {
		state,
		isListening: listenModeSession.isListening,
		level,
		secondsElapsed,
		start,
		send,
		cancel,
		stopListening,
	}
}

// the recorder module, which loads on the first recording
function loadVoiceRecorder(): Promise<typeof import("@/lib/voiceRecorder")> {
	return import("@/lib/voiceRecorder")
}

// the podcast player's audio context, made in the first question's tap and kept for the page
function toPodcastEpisodeQuestionAudioContext(): AudioContext {
	podcastEpisodeQuestionAudioContext ??= new AudioContext()
	return podcastEpisodeQuestionAudioContext
}

// a recording from a chat composer or the podcast player: the state machine from the mic tap to the transcript, the
// notices, the timings the spoken question event reports, and a composer's listen mode through useListenMode. the
// rules it decides with are in voiceRecordingRules, and the platform's microphone is the recorder adapter
import {
	fetchSpokenQuestionsStatus,
	type SpokenQuestionTimings,
	sendTranscription,
	type TranscriptionRejection,
	type VoiceRecordingBody,
} from "@carlnotes/client/voiceClient"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { useEffect, useRef, useState } from "react"
import { MICROPHONE_REJECTED_NOTICE, NO_SPEECH_NOTICE } from "../lib/chatRejectionCopy"
import type { VoiceRecorderAdapter, VoiceRecordingHandle, VoiceRecordingSession } from "../lib/voiceRecorder"
import {
	isRecordingTimerTicking,
	toLevelCallback,
	toReopenedRecordingRejection,
	toSpokenQuestionsRejection,
	type VoiceRecordingState,
} from "../lib/voiceRecordingRules"
import { pausePodcastEpisode } from "../stores/podcastEpisodePlayerStore"
import { endPodcastEpisodeQuestion } from "../stores/podcastEpisodeQuestionStore"
import { setIsVoiceRecordingActive, stopSpokenAnswer, unlockSpokenAnswer } from "../stores/spokenAnswerStore"
import { showChatRejectionNotice, showVoiceNotice } from "../stores/voiceNoticeStore"
import { useListenMode } from "./useListenMode"

// how often the timer re-renders
const TIMER_TICK_MS = 1_000

export type VoiceRecording = {
	state: VoiceRecordingState
	// whether listen mode is on, so the mic reopens on its own once carl finishes talking
	isListening: boolean
	// the meter's fill, 0 to 1 in steps of a twentieth
	level: number
	// how long the recording has run, for the timer
	secondsElapsed: number
	// start a recording from the mic tap, send it early, cancel it, end listen mode, or end both as leaving the app or
	// the composer's screen does
	start: () => void
	send: () => void
	cancel: () => void
	stopListening: () => void
	leave: () => void
}

// the recording to transcribe, how long it ran, and the page it posts for
type TranscribeOptions = { recording: VoiceRecordingBody; secondsRecorded: number; page: VoiceChatPage }

// the session and page a tapped recording opens on, its start count, and the mic's gate if it has one
type PrepareAndRecordOptions<Session extends VoiceRecordingSession> = {
	session: Session
	voiceChatPage: VoiceChatPage
	startCount: number
	canStartVoiceRecording?: () => Promise<boolean>
}

export type UseVoiceRecordingOptions<Session extends VoiceRecordingSession> = {
	// the page the transcription posts for, null while voice is off and the mic never renders
	page: VoiceChatPage | null
	// the platform's recorder, which keeps the same identity for the composer's life
	recorder: VoiceRecorderAdapter<Session>
	// what the composer sends once the transcript returns
	onTranscript: (transcript: string, timings: SpokenQuestionTimings) => void
	// what the mic does past the spoken questions cutoff
	onSpokenQuestionsPaused: () => void
	// shows a spent budget in the composer's own way. without it, the rejection is a notice
	onBudgetRejected?: () => void
	// a question asked from the podcast player: it ends on the voice activity detector, has no listen mode, and keeps
	// the page's session. a chat composer's recording ends a podcast player question instead
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
export function useVoiceRecording<Session extends VoiceRecordingSession>({
	page,
	recorder,
	onTranscript,
	onSpokenQuestionsPaused,
	onBudgetRejected,
	isPodcastEpisodeQuestion = false,
	canStartVoiceRecording,
	onVoiceRecordingEnded,
}: UseVoiceRecordingOptions<Session>): VoiceRecording {
	// the recording's state, listen mode, and the bar's meter and timer
	const [state, setState] = useState<VoiceRecordingState>("idle")
	const listenModeSession = useListenMode<Session>(reopen)
	const [level, setLevel] = useState(0)
	const [secondsElapsed, setSecondsElapsed] = useState(0)

	// the running recording's controls, the session the last tap opened, the states the callbacks read at once, and
	// whether the composer is mounted
	const recordingRef = useRef<VoiceRecordingHandle | null>(null)
	const tappedSessionRef = useRef<Session | null>(null)
	const stateRef = useRef<VoiceRecordingState>("idle")
	const isMountedRef = useRef(true)

	// a count of the recordings started, so a gate result or a microphone that arrives for an earlier one is ignored
	const startCountRef = useRef(0)

	// the latest options, so the recorder's callbacks never read a stale page or composer callback
	const latestOptions = {
		page,
		onTranscript,
		onSpokenQuestionsPaused,
		onBudgetRejected,
		canStartVoiceRecording,
		onVoiceRecordingEnded,
	}
	const optionsRef = useRef(latestOptions)
	optionsRef.current = latestOptions

	// the latest stop, cancel, and leave, which the unmount and the platform's listener call
	const stopListeningRef = useRef(stopListening)
	stopListeningRef.current = stopListening
	const cancelRef = useRef(cancel)
	cancelRef.current = cancel
	const leaveRef = useRef(leave)
	leaveRef.current = leave

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

	// an app that leaves the foreground ends listen mode and the recording, on a platform that reports it
	useEffect(() => recorder.subscribeToBackground?.(() => leaveRef.current()), [recorder])

	// set the state for the tap, for the render, and for the spoken answer store
	function changeState(nextState: VoiceRecordingState): void {
		stateRef.current = nextState
		setState(nextState)
		setIsVoiceRecordingActive(nextState !== "idle")
	}

	// end a recording with no transcript sent. the mic goes idle, the podcast player's session is suspended, listen mode
	// ends, and onVoiceRecordingEnded runs
	function endWithoutTranscript(): void {
		suspendPodcastEpisodeQuestionSession()
		changeState("idle")
		listenModeSession.endListening()
		optionsRef.current.onVoiceRecordingEnded?.()
	}

	// end a rejected recording and say why in the chat's words. the spoken questions cutoff runs the paused action
	function endWithRejection(rejection: TranscriptionRejection): void {
		endWithoutTranscript()
		if (rejection === "spokenQuestionsPaused") {
			optionsRef.current.onSpokenQuestionsPaused()
			return
		}

		// a spent budget shows the composer's own notice if it has one, and every other rejection is a notice
		showChatRejectionNotice(rejection, optionsRef.current.onBudgetRejected)
	}

	// reopen the mic on the listen session, with no tap and no prompt
	function reopen(): void {
		// a mic that is busy, a page with voice off, a closed session, or an unmounted composer ends listen mode instead
		const { page: voiceChatPage } = optionsRef.current
		const session = listenModeSession.getSession()
		if (stateRef.current !== "idle" || !voiceChatPage || !session || !isMountedRef.current) {
			listenModeSession.endListening()
			return
		}

		// the mic opens again at once as a reopened recording, so the first words are kept and its silence ends the
		// session quietly. the spoken questions read runs beside it
		listenModeSession.reopenListening()
		changeState("requesting")
		session.resume()
		startCountRef.current += 1
		void record(session, voiceChatPage, startCountRef.current)
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

	// post the recording, then send the transcript, or say why there is none. the recording is dropped once its post
	// ends, however it ends
	async function transcribe({ recording, secondsRecorded, page: voiceChatPage }: TranscribeOptions): Promise<void> {
		// the bar gives way to the spinner while the transcript is on its way
		recordingRef.current = null
		changeState("transcribing")
		const recordingSentAt = Date.now()
		const startCount = startCountRef.current
		const sendTranscriptionResult = await sendTranscription({ page: voiceChatPage, recording }).finally(() =>
			recorder.deleteRecording?.(recording),
		)

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
			showVoiceNotice(NO_SPEECH_NOTICE)
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
	async function record(session: Session, voiceChatPage: VoiceChatPage, startCount: number): Promise<void> {
		// a microphone that opens for an earlier recording is released with its callbacks quiet
		let isMicrophoneReleased = false
		const isCurrentRecording = (): boolean => !isMicrophoneReleased && startCount === startCountRef.current
		try {
			// the recorder loads on the first tap, and a recording cancelled while it loaded never asks for the microphone
			await recorder.load?.()
			if (!isCurrentRecording() || !isMountedRef.current) {
				return
			}
			const voiceRecordingHandle = await recorder.start({
				session,
				endOfSpeech: isPodcastEpisodeQuestion ? "voiceActivity" : "level",
				onLevel: toLevelCallback({ isPodcastEpisodeQuestion, setLevel }),
				onFinished: (recording, secondsRecorded) => {
					// a recording that finished for an earlier tap is dropped unsent
					if (!isCurrentRecording()) {
						recorder.deleteRecording?.(recording)
						return
					}
					suspendPodcastEpisodeQuestionSession()
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
						showVoiceNotice(NO_SPEECH_NOTICE)
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
		} catch (error) {
			// the recorder failed to load or the platform rejected the microphone request, for this recording alone
			if (!isCurrentRecording()) {
				return
			}
			endWithoutTranscript()
			showVoiceNotice(MICROPHONE_REJECTED_NOTICE, recorder.toMicrophoneRejectedAction?.(error))
		}
	}

	// a podcast player question's session is suspended between questions, and the next tap resumes it
	function suspendPodcastEpisodeQuestionSession(): void {
		if (isPodcastEpisodeQuestion) {
			tappedSessionRef.current?.suspend()
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

		// unlock the player and open the session inside the tap's gesture, before the recorder's async load. a composer's
		// session serves its whole listen session, and the podcast player's the whole page
		unlockSpokenAnswer()
		const session = recorder.openSession({ isPodcastEpisodeQuestion })
		tappedSessionRef.current = session
		listenModeSession.startListening(isPodcastEpisodeQuestion ? null : session)
		session.resume()

		// the gate, the spoken questions read, and the microphone run for this tap's count
		startCountRef.current += 1
		const { canStartVoiceRecording } = optionsRef.current
		void prepareAndRecord({ session, voiceChatPage, startCount: startCountRef.current, canStartVoiceRecording })
	}

	// run the tap's gate and read the spoken questions state before the microphone while the recorder loads, then
	// record, or stop with nothing recorded
	async function prepareAndRecord({
		session,
		voiceChatPage,
		startCount,
		canStartVoiceRecording,
	}: PrepareAndRecordOptions<Session>): Promise<void> {
		// the recorder loads beside the gate and the read. a failed load shows once record loads it again
		void recorder.load?.().catch(() => null)

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
			await record(session, voiceChatPage, startCount)
		}
	}

	// the bar's send control sends early. the tap unlocks the player again for the reply
	function send(): void {
		unlockSpokenAnswer()
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

	// leaving the app or the composer's screen cancels a recording still being asked for and ends listen mode with any
	// running recording. a transcript already on its way still sends, and its answer plays without reopening the mic
	function leave(): void {
		if (stateRef.current === "requesting") {
			cancel()
		}
		stopListening()
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
		leave,
	}
}

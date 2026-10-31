// listen mode, which a composer's mic tap starts: the mic reopens on its own once carl finishes his spoken answer,
// on the recording session the first tap opened, until the user stays quiet, stops carl, or cancels
import { useEffect, useRef, useState } from "react"
import type { VoiceRecordingSession } from "../lib/voiceRecorder"
import { usePodcastEpisodeQuestion } from "../stores/podcastEpisodeQuestionStore"
import type { SpokenAnswerEnd } from "../stores/spokenAnswerQueue"
import { subscribeToSpokenAnswerEnd } from "../stores/spokenAnswerStore"

// off, listening while the mic is open or the transcript is on its way, or waiting for carl to finish his spoken
// answer, after which the mic reopens
type ListenMode = "off" | "listening" | "waiting"

// how long listen mode waits for carl's spoken answer to end before it gives up
export const LISTEN_WAIT_TIMEOUT_MS = 2 * 60 * 1_000

// what a composer reads of its listen mode and the calls that move it
export type ListenModeSession<Session extends VoiceRecordingSession = VoiceRecordingSession> = {
	// whether listen mode is on, for the render
	isListening: boolean
	// whether the running recording was reopened by listen mode, and the session's recording session, read at once
	isReopened: () => boolean
	getSession: () => Session | null
	// start a session from a tap, with its recording session, or with none for a recording that has no listen mode
	startListening: (session: Session | null) => void
	// mark the recording the session reopened, wait for carl's answer once the transcript is sent, or end the session
	reopenListening: () => void
	waitForSpokenAnswer: () => void
	endListening: () => void
}

/**
 * Owns one composer's listen mode and calls onReopen once carl's own spoken answer finishes while the session waits.
 */
export function useListenMode<Session extends VoiceRecordingSession>(onReopen: () => void): ListenModeSession<Session> {
	// the mode for the render and for the callbacks, the session's recording session, whether the running recording
	// was reopened, and the wait for carl's answer to end
	const [listenMode, setListenMode] = useState<ListenMode>("off")
	const listenModeRef = useRef<ListenMode>("off")
	const sessionRef = useRef<Session | null>(null)
	const isReopenedRef = useRef(false)
	const waitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// the latest end-of-answer handler, which the store's listener calls
	const handleSpokenAnswerEndRef = useRef(handleSpokenAnswerEnd)
	handleSpokenAnswerEndRef.current = handleSpokenAnswerEnd

	// listen mode reopens the mic once carl's spoken answer ends
	useEffect(
		() => subscribeToSpokenAnswerEnd((spokenAnswerEnd) => handleSpokenAnswerEndRef.current(spokenAnswerEnd)),
		[],
	)

	// a question asked from the podcast player ends the session, so its answer never reopens a composer's mic
	const { phase: podcastEpisodeQuestionPhase } = usePodcastEpisodeQuestion()
	const endListeningRef = useRef(endListening)
	endListeningRef.current = endListening
	useEffect(() => {
		if (podcastEpisodeQuestionPhase !== "idle") {
			endListeningRef.current()
		}
	}, [podcastEpisodeQuestionPhase])

	// set listen mode for the callbacks and for the render
	function changeListenMode(nextListenMode: ListenMode): void {
		listenModeRef.current = nextListenMode
		setListenMode(nextListenMode)
	}

	// a tap starts listening on its own session, and a recording with no session has no listen mode
	function startListening(session: Session | null): void {
		changeListenMode(session ? "listening" : "off")
		isReopenedRef.current = false
		if (session) {
			sessionRef.current = session
		}
	}

	// the recording that opens now was reopened by listen mode
	function reopenListening(): void {
		clearWaitTimeout()
		changeListenMode("listening")
		isReopenedRef.current = true
	}

	// a sent transcript waits for carl's answer to end, and gives up after the timeout
	function waitForSpokenAnswer(): void {
		if (listenModeRef.current !== "listening") {
			return
		}

		// wait, and end the session if carl's answer never ends
		changeListenMode("waiting")
		clearWaitTimeout()
		waitTimeoutRef.current = setTimeout(() => {
			if (listenModeRef.current === "waiting") {
				endListening()
			}
		}, LISTEN_WAIT_TIMEOUT_MS)
	}

	// end listen mode, drop the wait, and close the session's recording session
	function endListening(): void {
		clearWaitTimeout()
		changeListenMode("off")
		isReopenedRef.current = false

		// the recording session closes with listen mode
		const session = sessionRef.current
		sessionRef.current = null
		session?.close()
	}

	// drop the wait, if one is running
	function clearWaitTimeout(): void {
		if (waitTimeoutRef.current) {
			clearTimeout(waitTimeoutRef.current)
			waitTimeoutRef.current = null
		}
	}

	// carl's answer ended. his own answer finishing reopens the mic, and his own answer stopped ends listen mode
	function handleSpokenAnswerEnd({ isPlayedToEnd, isAutoPlayed }: SpokenAnswerEnd): void {
		// an answer the user played by its button changes nothing, even one a new answer replaced
		if (listenModeRef.current !== "waiting" || !isAutoPlayed) {
			return
		}

		// carl's own answer stopped means the user wants out, and finished means it is their turn
		if (isPlayedToEnd) {
			onReopen()
		} else {
			endListening()
		}
	}

	// the session's controls, with the mode as one flag
	return {
		isListening: listenMode !== "off",
		isReopened: () => isReopenedRef.current,
		getSession: () => sessionRef.current,
		startListening,
		reopenListening,
		waitForSpokenAnswer,
		endListening,
	}
}

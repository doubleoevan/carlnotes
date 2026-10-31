// the voice recorder: the microphone stream, the level meter over it, and the recorder that keeps the audio. the end
// of speech is the level's silence, or the voice activity detector's once it loads
import type {
	StartVoiceRecordingOptions,
	VoiceRecordingEnd,
	VoiceRecordingHandle,
	VoiceRecordingSession,
} from "@carlnotes/core/lib/voiceRecorder"
import {
	toRecordingDecision,
	toRecordingLevel,
	toRecordingLevelReader,
	toRecordingMimeType,
	toSecondsRecorded,
	toSpeechFrame,
	type VoiceActivityProgress,
} from "@carlnotes/core/lib/voiceRecordingDecisions"

// the share of each frame's level that reaches the smoothed level, so the meter moves without flicker
const LEVEL_SMOOTHING = 0.3

// core's recording options with the context that the tap created and resumed before the microphone was asked for.
// WebKit needs that order for the analyser to read a live level on iOS
type BrowserVoiceRecordingOptions = Omit<StartVoiceRecordingOptions<VoiceRecordingSession>, "session"> & {
	audioContext: AudioContext
}

/**
 * Asks for the microphone, records it, and watches its level until the user stops, the limit passes, or the recording
 * is sent or cancelled. With endOfSpeech set to voiceActivity, the voice activity detector ends the speech once it
 * loads, with the level's silence until then and for good if it fails to start. Throws if the browser rejects the
 * microphone request or cannot record the stream.
 */
export async function startVoiceRecording({
	audioContext,
	onLevel,
	onFinished,
	onCancelled,
	endOfSpeech,
}: BrowserVoiceRecordingOptions): Promise<VoiceRecordingHandle> {
	// give the audio session back to the browser before the request, so WebKit sets the capture category itself. an
	// earlier recording left the session on playback, and iOS keeps that until it is set again
	setAudioSessionType("auto")

	// the microphone. a request the browser rejects releases the capture and throws
	let stream: MediaStream
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: true })
	} catch (error) {
		releaseCapture(null)
		throw error
	}

	// the analyser over the stream, and the recorder in the first container the browser supports. a stream the browser
	// cannot analyse or record releases the capture, its tracks included, and throws
	let analyser: AnalyserNode
	let streamSource: MediaStreamAudioSourceNode
	let mediaRecorder: MediaRecorder
	try {
		analyser = audioContext.createAnalyser()
		analyser.fftSize = 1024
		streamSource = audioContext.createMediaStreamSource(stream)
		streamSource.connect(analyser)

		// the recorder, in the browser's own default container if it supports none of the listed ones
		const mimeType = toRecordingMimeType((recordingMimeType) => MediaRecorder.isTypeSupported(recordingMimeType))
		mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
	} catch (error) {
		releaseCapture(stream)
		throw error
	}

	// keep each chunk the recorder delivers
	const recordedChunks: Blob[] = []
	mediaRecorder.addEventListener("dataavailable", (event) => {
		if (event.data.size > 0) {
			recordedChunks.push(event.data)
		}
	})

	// the loop's frame buffer, the smoothed level, and the reader that sets the meter and the silence threshold
	const startedAt = Date.now()
	const sampleBytes = new Uint8Array(analyser.fftSize)
	let level = 0
	const recordingLevelReader = toRecordingLevelReader({ startedAt, onLevel })

	// whether speech started, when the level was last above the silence threshold, and the frame the loop waits on
	let hasSpeechStarted = false
	let lastLoudAt = startedAt
	let animationFrame = 0

	// how the recording ended, set once
	let endReason: VoiceRecordingEnd | null = null

	// the voice activity detector's progress and its stop, once it loads
	const voiceActivityProgress: VoiceActivityProgress = {
		isListening: false,
		hasSpeechStarted: false,
		isSpeechEnded: false,
	}
	let stopVoiceActivity: (() => void) | null = null

	// whether the level heard speech before the detector listened, set on the first frame the detector listens
	let hasLevelSpeechBeforeListening: boolean | null = null

	// end the recording: stop the loop and the recorder, and release the capture
	const endRecording = (reason: VoiceRecordingEnd): void => {
		if (endReason !== null) {
			return
		}
		endReason = reason
		cancelAnimationFrame(animationFrame)
		document.removeEventListener("visibilitychange", handleVisibilityChange)
		stopVoiceActivity?.()

		// the recorder's stop delivers the last chunk
		if (mediaRecorder.state !== "inactive") {
			mediaRecorder.stop()
		}

		// disconnect the stream's audio nodes from the context, which the podcast player keeps for the page, and release
		// the capture
		streamSource.disconnect()
		releaseCapture(stream)
	}

	// read what this frame says about the speech, and return whether it ended. note once whether the level heard speech
	// before the detector listened
	const readSpeechFrame = (frameSilenceThreshold: number, now: number): boolean => {
		if (voiceActivityProgress.isListening && hasLevelSpeechBeforeListening === null) {
			hasLevelSpeechBeforeListening = hasSpeechStarted
		}

		// the frame says whether speech started and whether it is loud, and a loud frame holds the level's silence off
		const speechFrame = toSpeechFrame({
			level,
			silenceThreshold: frameSilenceThreshold,
			hasSpeechStarted,
			hasLevelSpeechBeforeListening: hasLevelSpeechBeforeListening === true,
			voiceActivityProgress,
		})
		hasSpeechStarted = speechFrame.hasSpeechStarted
		if (speechFrame.isLoud) {
			lastLoudAt = now
		}
		return speechFrame.isSpeechEnded
	}

	// read the level each frame, set the silence threshold from the first frames, and decide whether the recording goes
	// on
	const readLevel = (): void => {
		analyser.getByteTimeDomainData(sampleBytes)
		const now = Date.now()
		level += (toRecordingLevel(sampleBytes) - level) * LEVEL_SMOOTHING

		// the first frames sample the room, and nothing is decided until the silence threshold is set
		const silenceThreshold = recordingLevelReader.readLevel(level, now)
		if (silenceThreshold === null) {
			animationFrame = requestAnimationFrame(readLevel)
			return
		}

		// the detector's speech end sends
		if (readSpeechFrame(silenceThreshold, now)) {
			endRecording("send")
			return
		}

		// send once the user stops or the limit passes
		const recordingDecision = toRecordingDecision({ hasSpeechStarted, lastLoudAt, startedAt, now })
		if (recordingDecision === "send") {
			endRecording("send")
			return
		}

		// cancel if nobody spoke, else keep going
		if (recordingDecision === "cancel") {
			endRecording("noSpeech")
			return
		}
		animationFrame = requestAnimationFrame(readLevel)
	}

	// a hidden page cancels the recording
	function handleVisibilityChange(): void {
		if (document.visibilityState === "hidden") {
			endRecording("hidden")
		}
	}
	document.addEventListener("visibilitychange", handleVisibilityChange)

	// the recorder's stop event holds the last chunk, so the recording or the cancel is reported from it
	mediaRecorder.addEventListener("stop", () => {
		// a track that ends on its own, for a call or another app, stops the recorder before any end was called, so
		// the loop, the context, and the listener are ended here first
		if (endReason === null) {
			endRecording("user")
		}

		// a sent recording is the chunks in the recorder's container, and any other end is a cancel
		if (endReason === "send") {
			onFinished(new Blob(recordedChunks, { type: mediaRecorder.mimeType }), toSecondsRecorded(startedAt))
			return
		}
		onCancelled(endReason ?? "user")
	})

	// start the recorder and the loop, then the detector if this recording asks for it, and return the controls
	mediaRecorder.start()
	animationFrame = requestAnimationFrame(readLevel)
	if (endOfSpeech === "voiceActivity") {
		void startRecordingVoiceActivity({ audioContext, stream, voiceActivityProgress }).then((stop) => {
			// a recording that already ended stops the detector at once
			stopVoiceActivity = stop
			if (endReason !== null) {
				stop?.()
			}
		})
	}
	return { send: () => endRecording("send"), cancel: () => endRecording("user") }
}

// the recording's audio context and stream, and the progress the detector's events write to
type StartRecordingVoiceActivityOptions = {
	audioContext: AudioContext
	stream: MediaStream
	voiceActivityProgress: VoiceActivityProgress
}

// load the voice activity detector and listen to the recording's stream, returning its stop, or null if it cannot run.
// a blip too short to be speech takes back the speech it started
async function startRecordingVoiceActivity({
	audioContext,
	stream,
	voiceActivityProgress,
}: StartRecordingVoiceActivityOptions): Promise<(() => void) | null> {
	// the detector's module loads on the first question only
	try {
		const { startVoiceActivity } = await import("./voiceActivity")
		const stopVoiceActivity = await startVoiceActivity({
			audioContext,
			stream,
			onSpeechStart: () => {
				voiceActivityProgress.hasSpeechStarted = true
			},
			onSpeechEnd: () => {
				voiceActivityProgress.isSpeechEnded = true
			},
			onMisfire: () => {
				voiceActivityProgress.hasSpeechStarted = false
			},
		})

		// the detector decides from here, unless it could not run on this device
		voiceActivityProgress.isListening = stopVoiceActivity !== null
		return stopVoiceActivity
	} catch (error) {
		// a module that failed to load leaves the level's silence deciding
		console.error("voice activity detection could not load", error)
		return null
	}
}

// release the capture: stop the stream's tracks, and give the audio session back to playback, so a reply never plays
// quieter after the capture
function releaseCapture(stream: MediaStream | null): void {
	for (const track of stream?.getTracks() ?? []) {
		track.stop()
	}
	setAudioSessionType("playback")
}

// set the audio session's type where the browser has one. iOS keeps an explicit type until it is set again, so the
// end gives the session back to playback, and the start gives it back to the browser as auto
function setAudioSessionType(audioSessionType: "auto" | "playback"): void {
	const { audioSession } = navigator as Navigator & { audioSession?: { type: string } }
	if (audioSession) {
		audioSession.type = audioSessionType
	}
}

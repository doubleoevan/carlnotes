// the voice recorder: the microphone stream, the level meter over it, the end-of-speech decision, and the recorder
// that keeps the audio
import { VOICE_RECORDING_MAX_SECONDS } from "@shared/payloads"

// the containers the recorder tries, in order, taking the first the browser supports
const RECORDING_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4"]

// how long the start of the stream samples the room's ambient level before the silence threshold is set
const AMBIENT_SAMPLE_MS = 300

// ponytail: the silence threshold's shape is a guess at a phone in a room. the minimum keeps digital silence from
// reading every breath as speech, and the ratio and the margin lift the silence threshold over a noisy room. adjust
// them from device checks
const SILENCE_THRESHOLD_MINIMUM = 0.02
const SILENCE_THRESHOLD_AMBIENT_RATIO = 1.5
const SILENCE_THRESHOLD_MARGIN = 0.01

// how long under the silence threshold sends the recording once speech started, how long with no speech cancels it, and
// the longest recording
const END_OF_SPEECH_MS = 1_500
const NO_SPEECH_MS = 8_000
const RECORDING_LIMIT_MS = VOICE_RECORDING_MAX_SECONDS * 1000

// the share of each frame's level that reaches the smoothed level, so the meter moves without flicker
const LEVEL_SMOOTHING = 0.3

// how much of the meter a level fills, and how many steps the meter draws. speech sits well under full scale, so the
// meter reaches full before it
const METER_LEVEL_SCALE = 3
const METER_STEPS = 20

// what the loop decides each frame: keep recording, send the recording, or cancel it
export type RecordingDecision = "keep" | "send" | "cancel"

// why a recording was cancelled: nothing rose above the silence threshold, the page was hidden, or the user cancelled
// it
export type VoiceRecordingCancelReason = "noSpeech" | "hidden" | "user"

// the running recording's controls: send it early, or cancel it
export type VoiceRecordingHandle = {
	send: () => void
	cancel: () => void
}

export type StartVoiceRecordingOptions = {
	// the context the tap created and resumed before the microphone was asked for, which is the order WebKit needs
	// for the analyser to read a live level on iOS
	audioContext: AudioContext
	// the meter's fill, 0 to 1 in steps of a twentieth, each time the step changes
	onLevel: (meterLevel: number) => void
	// the recording and how many seconds it recorded, once it is sent
	onFinished: (recording: Blob, secondsRecorded: number) => void
	onCancelled: (reason: VoiceRecordingCancelReason) => void
}

export type ToRecordingDecisionOptions = {
	hasSpeechStarted: boolean
	lastLoudAt: number
	startedAt: number
	now: number
}

/**
 * Asks for the microphone, records it, and watches its level until the speaker stops, the limit passes, or the
 * recording is sent or cancelled. Throws if the browser rejects the microphone request or cannot record the stream.
 */
export async function startVoiceRecording({
	audioContext,
	onLevel,
	onFinished,
	onCancelled,
}: StartVoiceRecordingOptions): Promise<VoiceRecordingHandle> {
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
	let mediaRecorder: MediaRecorder
	try {
		analyser = audioContext.createAnalyser()
		analyser.fftSize = 1024
		audioContext.createMediaStreamSource(stream).connect(analyser)

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

	// the loop's frame buffer, the smoothed level, and the ambient sample the silence threshold is set from
	const startedAt = Date.now()
	const sampleBytes = new Uint8Array(analyser.fftSize)
	let level = 0
	let meterLevel = 0
	let ambientLevelSum = 0
	let ambientFrameCount = 0

	// the silence threshold once it is set, when the level was last above it, and the frame the loop waits on
	let silenceThreshold: number | null = null
	let hasSpeechStarted = false
	let lastLoudAt = startedAt
	let animationFrame = 0

	// how the recording ended, set once
	let endReason: "send" | VoiceRecordingCancelReason | null = null

	// end the recording: stop the loop and the recorder, and release the capture
	const endRecording = (reason: "send" | VoiceRecordingCancelReason): void => {
		if (endReason !== null) {
			return
		}
		endReason = reason
		cancelAnimationFrame(animationFrame)
		document.removeEventListener("visibilitychange", handleVisibilityChange)

		// the recorder's stop delivers the last chunk
		if (mediaRecorder.state !== "inactive") {
			mediaRecorder.stop()
		}
		releaseCapture(stream)
	}

	// read the level each frame, set the silence threshold from the first frames, and decide whether the recording goes
	// on
	const readLevel = (): void => {
		analyser.getByteTimeDomainData(sampleBytes)
		const now = Date.now()
		level += (toRecordingLevel(sampleBytes) - level) * LEVEL_SMOOTHING

		// report the meter only if its drawn step changed
		const nextMeterLevel = toMeterLevel(level)
		if (nextMeterLevel !== meterLevel) {
			meterLevel = nextMeterLevel
			onLevel(meterLevel)
		}

		// the first frames sample the room, then the silence threshold sits a margin above it
		if (silenceThreshold === null) {
			ambientLevelSum += level
			ambientFrameCount += 1
			if (now - startedAt >= AMBIENT_SAMPLE_MS) {
				silenceThreshold = toSilenceThreshold(ambientLevelSum / ambientFrameCount)
			}

			// nothing is decided until the silence threshold is set
			animationFrame = requestAnimationFrame(readLevel)
			return
		}

		// a frame above the silence threshold is speech
		if (level > silenceThreshold) {
			hasSpeechStarted = true
			lastLoudAt = now
		}

		// send once the speaker stops or the limit passes
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

	// start the recorder and the loop, and return the controls
	mediaRecorder.start()
	animationFrame = requestAnimationFrame(readLevel)
	return { send: () => endRecording("send"), cancel: () => endRecording("user") }
}

/**
 * Returns the level of a frame of 8-bit time domain samples, 0 for silence to 1 for full scale.
 */
export function toRecordingLevel(bytes: Uint8Array): number {
	if (bytes.length === 0) {
		return 0
	}

	// the root mean square of the samples around the midpoint
	let squaredSum = 0
	for (const byte of bytes) {
		const sample = (byte - 128) / 128
		squaredSum += sample * sample
	}
	return Math.sqrt(squaredSum / bytes.length)
}

/**
 * Returns how much of the meter a smoothed level fills, 0 to 1 in steps of a twentieth.
 */
export function toMeterLevel(level: number): number {
	return Math.round(Math.min(1, level * METER_LEVEL_SCALE) * METER_STEPS) / METER_STEPS
}

/**
 * Returns the level a frame must rise above to count as speech: a margin above the room's ambient level, never
 * under a fixed minimum.
 */
export function toSilenceThreshold(ambientLevel: number): number {
	return Math.max(SILENCE_THRESHOLD_MINIMUM, ambientLevel * SILENCE_THRESHOLD_AMBIENT_RATIO + SILENCE_THRESHOLD_MARGIN)
}

/**
 * Returns what the recording does this frame: it sends at the limit, or once the speaker has been quiet long enough
 * after speaking, it cancels if nobody spoke in the first seconds, and it keeps going otherwise.
 */
export function toRecordingDecision({
	hasSpeechStarted,
	lastLoudAt,
	startedAt,
	now,
}: ToRecordingDecisionOptions): RecordingDecision {
	// the limit sends whatever was recorded
	if (now - startedAt >= RECORDING_LIMIT_MS) {
		return "send"
	}

	// after speech, a long enough quiet sends. before any, a long enough quiet cancels
	if (hasSpeechStarted) {
		return now - lastLoudAt >= END_OF_SPEECH_MS ? "send" : "keep"
	}
	return now - startedAt >= NO_SPEECH_MS ? "cancel" : "keep"
}

/**
 * Returns the first container the browser supports, or undefined if it supports none, which leaves the browser's
 * own default.
 */
export function toRecordingMimeType(isTypeSupported: (mimeType: string) => boolean): string | undefined {
	return RECORDING_MIME_TYPES.find(isTypeSupported)
}

// how many whole seconds the recording lasted, inside the limit
function toSecondsRecorded(startedAt: number): number {
	return Math.min(VOICE_RECORDING_MAX_SECONDS, Math.round((Date.now() - startedAt) / 1000))
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

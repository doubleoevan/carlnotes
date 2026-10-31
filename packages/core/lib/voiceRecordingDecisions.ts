// what the voice recorder decides from each frame: the speech level, the meter, the silence threshold, whether
// speech started or ended, and whether the recording keeps going, sends, or cancels
import { VOICE_RECORDING_MAX_SECONDS } from "@carlnotes/contracts/payloads"

// the containers the recorder tries, in order, taking the first the browser supports
const RECORDING_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4"]

// the silence threshold's settings: the minimum keeps digital silence from reading every breath as speech, and the
// ambient ratio and the margin lift the silence threshold over a noisy room
export type SilenceThresholdSettings = { minimum: number; ambientRatio: number; margin: number }

// ponytail: the browser's settings are a guess at a phone in a room. adjust them from device checks
export const BROWSER_SILENCE_THRESHOLD_SETTINGS: SilenceThresholdSettings = {
	minimum: 0.02,
	ambientRatio: 1.5,
	margin: 0.01,
}

// how long under the silence threshold sends the recording once speech started, how long with no speech cancels it, and
// the longest recording. the voice activity detector waits the same pause
export const END_OF_SPEECH_MS = 1_500
const NO_SPEECH_MS = 8_000
export const RECORDING_LIMIT_MS = VOICE_RECORDING_MAX_SECONDS * 1000

// how long the start of a recording samples the room's ambient level before the silence threshold is set
const AMBIENT_SAMPLE_MS = 300

// how much of the meter a level fills, and how many steps the meter draws. speech sits well under full scale, so the
// meter reaches full before it
const METER_LEVEL_SCALE = 3
const METER_STEPS = 20

// what the loop decides each frame: keep recording, send the recording, or cancel it
export type RecordingDecision = "keep" | "send" | "cancel"

// what the voice activity detector heard so far in this recording: whether it is listening, whether speech started,
// and whether speech ended
export type VoiceActivityProgress = { isListening: boolean; hasSpeechStarted: boolean; isSpeechEnded: boolean }

// a recording's level reader, which each platform's loop feeds its frames
export type RecordingLevelReader = {
	// report the frame's level to the meter, and return the silence threshold, or null while the room is sampled
	readLevel: (level: number, now: number) => number | null
	// the room's sampled level and the silence threshold set from it, each 0 until it is known
	readAmbientSample: () => { ambientLevel: number; silenceThreshold: number }
}

export type ToRecordingDecisionOptions = {
	hasSpeechStarted: boolean
	lastLoudAt: number
	startedAt: number
	now: number
}

// one frame's level, the silence threshold, and what the level and the voice activity detector heard so far
export type ToSpeechFrameOptions = {
	level: number
	silenceThreshold: number
	hasSpeechStarted: boolean
	hasLevelSpeechBeforeListening: boolean
	voiceActivityProgress: VoiceActivityProgress
}

// what one frame says: whether speech ended, whether speech started, and whether the frame is loud
export type SpeechFrame = { isSpeechEnded: boolean; hasSpeechStarted: boolean; isLoud: boolean }

/**
 * Returns what one frame says about the speech, from the voice activity detector once it listens or the level before.
 */
export function toSpeechFrame({
	level,
	silenceThreshold,
	hasSpeechStarted,
	hasLevelSpeechBeforeListening,
	voiceActivityProgress,
}: ToSpeechFrameOptions): SpeechFrame {
	// once the detector listens, its speech end ends the recording, and every frame reads loud so the level's silence
	// never does. speech heard only before the detector listened still ends on the level's silence
	const hasDetectorHeardSpeech = voiceActivityProgress.hasSpeechStarted || voiceActivityProgress.isSpeechEnded
	if (voiceActivityProgress.isListening && (hasDetectorHeardSpeech || !hasLevelSpeechBeforeListening)) {
		return {
			isSpeechEnded: voiceActivityProgress.isSpeechEnded,
			hasSpeechStarted: voiceActivityProgress.hasSpeechStarted,
			isLoud: true,
		}
	}

	// before then, a frame above the silence threshold is speech
	const isLoud = level > silenceThreshold
	return { isSpeechEnded: false, hasSpeechStarted: hasSpeechStarted || isLoud, isLoud }
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
 * Returns the level that a frame must rise above to count as speech: a margin above the room's ambient level, never
 * under the settings' minimum. The browser's settings are the default.
 */
export function toSilenceThreshold(
	ambientLevel: number,
	{ minimum, ambientRatio, margin }: SilenceThresholdSettings = BROWSER_SILENCE_THRESHOLD_SETTINGS,
): number {
	return Math.max(minimum, ambientLevel * ambientRatio + margin)
}

/**
 * Returns what the recording does this frame: it sends at the limit, or once the user has been quiet long enough
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
 * Returns the level reader for one recording. The reader reports the meter only if its drawn step changed, samples the
 * room's ambient level from the first frames, and sets the silence threshold in the platform's settings once the
 * sample is long enough. The frame that sets the silence threshold decides nothing.
 */
export function toRecordingLevelReader({
	startedAt,
	onLevel,
	silenceThresholdSettings,
}: {
	startedAt: number
	onLevel: (meterLevel: number) => void
	silenceThresholdSettings?: SilenceThresholdSettings
}): RecordingLevelReader {
	// the meter's drawn step, the ambient sample, and the silence threshold once it is set
	let meterLevel = 0
	let ambientLevelSum = 0
	let ambientFrameCount = 0
	let silenceThreshold: number | null = null
	return {
		readLevel: (level, now) => {
			// report the meter only if its drawn step changed
			const nextMeterLevel = toMeterLevel(level)
			if (nextMeterLevel !== meterLevel) {
				meterLevel = nextMeterLevel
				onLevel(meterLevel)
			}

			// a set silence threshold decides the frame
			if (silenceThreshold !== null) {
				return silenceThreshold
			}

			// the first frames sample the room, then the silence threshold sits a margin above it
			ambientLevelSum += level
			ambientFrameCount += 1
			if (now - startedAt >= AMBIENT_SAMPLE_MS) {
				silenceThreshold = toSilenceThreshold(ambientLevelSum / ambientFrameCount, silenceThresholdSettings)
			}
			return null
		},
		readAmbientSample: () => ({
			ambientLevel: ambientFrameCount > 0 ? ambientLevelSum / ambientFrameCount : 0,
			silenceThreshold: silenceThreshold ?? 0,
		}),
	}
}

/**
 * Returns how many whole seconds a recording lasted, inside the limit.
 */
export function toSecondsRecorded(startedAt: number): number {
	return Math.min(VOICE_RECORDING_MAX_SECONDS, Math.round((Date.now() - startedAt) / 1000))
}

/**
 * Returns the first container the browser supports, or undefined if it supports none, which leaves the browser's
 * own default.
 */
export function toRecordingMimeType(isTypeSupported: (mimeType: string) => boolean): string | undefined {
	return RECORDING_MIME_TYPES.find(isTypeSupported)
}

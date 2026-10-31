// the phone's voice recorder: an expo-audio recorder per recording, in mono AAC, whose metering the shared recording
// decisions read every 100 ms to end the speech. the app passes in the native pieces, so the loop runs in tests
import type { NativeFilePart } from "@carlnotes/client/apiClient"
import { toRecordingFileName } from "@carlnotes/client/voiceClient"
import type { MobilePlatform } from "@carlnotes/contracts/clientTelemetry"
import { VOICE_RECORDING_MAX_SECONDS } from "@carlnotes/contracts/payloads"
import type {
	StartVoiceRecordingOptions,
	VoiceRecorderAdapter,
	VoiceRecordingEnd,
	VoiceRecordingHandle,
	VoiceRecordingSession,
} from "@carlnotes/core/lib/voiceRecorder"
import {
	RECORDING_LIMIT_MS,
	type SilenceThresholdSettings,
	toRecordingDecision,
	toRecordingLevelReader,
	toSecondsRecorded,
	toSpeechFrame,
	type VoiceActivityProgress,
} from "@carlnotes/core/lib/voiceRecordingDecisions"
import type { AudioRecorder, RecorderState } from "expo-audio"
import { type MicrophonePermission, MicrophoneRejectedError, toMicrophoneRejectedAction } from "./voicePermission"

// how often the loop reads the recorder's status
export const LEVEL_READ_MS = 100

// the container that the recording posts as, and the prefix of every recording's file name
const RECORDING_CONTENT_TYPE = "audio/mp4"
export const VOICE_RECORDING_FILE_PREFIX = "voice-recording-"

// ponytail: the phone's silence threshold settings are a guess until the device checks measure a quiet room and a
// noisy one. Android's metering reads the loudest sample since the last read, so it sits higher than the browser's level
export const NATIVE_SILENCE_THRESHOLD_SETTINGS: SilenceThresholdSettings = {
	minimum: 0.03,
	ambientRatio: 2,
	margin: 0.01,
}

// the recorder the loop drives, as expo-audio's recorder has it
export type NativeVoiceRecorder = Pick<
	AudioRecorder,
	"prepareToRecordAsync" | "record" | "stop" | "getStatus" | "uri"
> & {
	release: () => void
}

// the options that a recorder is made with, already flattened for one platform as expo-audio's constructor takes them
export type PlatformRecordingOptions = Record<string, string | number | boolean>

// one recording's level summary, which a development build logs to measure the silence threshold on hardware
export type VoiceLevelTrace = {
	platform: MobilePlatform
	ambientLevel: number
	silenceThreshold: number
	peakLevel: number
	recordingEnd: VoiceRecordingEnd
}

// the native pieces that the app passes in
export type ToVoiceRecorderAdapterOptions = {
	platform: MobilePlatform
	createRecorder: (options: PlatformRecordingOptions) => NativeVoiceRecorder
	requestMicrophone: () => Promise<MicrophonePermission>
	setIsRecordingAudioMode: (isRecording: boolean) => Promise<void>
	deleteFile: (uri: string) => void
	openSettings: () => void
	subscribeToBackground: (listener: () => void) => () => void
	// the level trace, set in a development build only
	traceLevel?: (voiceLevelTrace: VoiceLevelTrace) => void
}

// the phone's recording session does nothing. the phone keeps nothing open between recordings
const NATIVE_VOICE_RECORDING_SESSION: VoiceRecordingSession = { resume: () => {}, suspend: () => {}, close: () => {} }

/**
 * Returns the recording options for one platform: mono AAC at 16 kHz and 32 kbps in an m4a, with metering on, written
 * to the cache under the recording's file name.
 */
export function toPlatformRecordingOptions(platform: MobilePlatform, fileName: string): PlatformRecordingOptions {
	// what both platforms share
	const sharedOptions = {
		extension: ".m4a",
		sampleRate: 16_000,
		numberOfChannels: 1,
		bitRate: 32_000,
		isMeteringEnabled: true,
		directory: "cache",
		fileName,
	}

	// iOS takes the AAC format code and a quality, and Android the container and the encoder
	return platform === "ios"
		? { ...sharedOptions, outputFormat: "aac ", audioQuality: 96 }
		: { ...sharedOptions, outputFormat: "mpeg4", audioEncoder: "aac" }
}

/**
 * Returns the linear level, 0 to 1, of a metering reading in dBFS. No reading is silence.
 */
export function toLinearLevel(meteringDecibels: number | undefined): number {
	if (meteringDecibels === undefined || !Number.isFinite(meteringDecibels)) {
		return 0
	}
	return Math.min(1, 10 ** (meteringDecibels / 20))
}

/**
 * Returns how a recorder status ends a recording that the app did not stop: the limit if it ran its full length, an
 * interruption if a call, another app, or a reset of the media services stopped it, or nothing while it records.
 */
export function toRecorderStatusEnd(
	status: Pick<RecorderState, "isRecording" | "durationMillis" | "mediaServicesDidReset">,
	hasRecordingStarted: boolean,
): "send" | "interrupted" | null {
	// a reset of the media services ends the recorder whatever it reports
	if (status.mediaServicesDidReset) {
		return "interrupted"
	}

	// a recorder that is recording, or that has not started yet, ends nothing
	if (status.isRecording || !hasRecordingStarted) {
		return null
	}
	return status.durationMillis >= RECORDING_LIMIT_MS - LEVEL_READ_MS * 5 ? "send" : "interrupted"
}

/**
 * Returns the file part that a recording posts as.
 */
export function toRecordingFilePart(uri: string): NativeFilePart {
	return { uri, name: toRecordingFileName(RECORDING_CONTENT_TYPE), type: RECORDING_CONTENT_TYPE }
}

/**
 * Returns the phone's recorder adapter over the native pieces that the app passes in.
 */
export function toVoiceRecorderAdapter(options: ToVoiceRecorderAdapterOptions): VoiceRecorderAdapter {
	return {
		openSession: () => NATIVE_VOICE_RECORDING_SESSION,
		start: (startOptions) => startVoiceRecording(options, startOptions),
		deleteRecording: (recording) => {
			if ("uri" in recording) {
				options.deleteFile(recording.uri)
			}
		},
		toMicrophoneRejectedAction: (error) => toMicrophoneRejectedAction(error, options.openSettings),
		subscribeToBackground: options.subscribeToBackground,
	}
}

// ask for the microphone, switch the audio mode to recording, and record until the silence rules or a control end it.
// throws if the microphone is denied or the recorder cannot start, with the audio mode switched back
async function startVoiceRecording(
	{
		platform,
		createRecorder,
		requestMicrophone,
		setIsRecordingAudioMode,
		deleteFile,
		traceLevel,
	}: ToVoiceRecorderAdapterOptions,
	{ onLevel, onFinished, onCancelled }: StartVoiceRecordingOptions<VoiceRecordingSession>,
): Promise<VoiceRecordingHandle> {
	// the microphone, asked for on the first tap
	const microphonePermission = await requestMicrophone()
	if (microphonePermission !== "granted") {
		throw new MicrophoneRejectedError(microphonePermission)
	}

	// the recording audio mode, then a recorder of its own that records for at most the limit
	await setIsRecordingAudioMode(true)
	const recorder = createRecorder(toPlatformRecordingOptions(platform, `${VOICE_RECORDING_FILE_PREFIX}${Date.now()}`))
	try {
		await recorder.prepareToRecordAsync()
		recorder.record({ forDuration: VOICE_RECORDING_MAX_SECONDS })
	} catch (error) {
		// a recorder that cannot start is released, with its file and the audio mode
		const uri = recorder.uri
		recorder.release()
		if (uri) {
			deleteFile(uri)
		}
		await setIsRecordingAudioMode(false)
		throw error
	}

	// the level, its peak, and the reader that sets the meter and the silence threshold from the phone's settings
	const startedAt = Date.now()
	let level = 0
	let peakLevel = 0
	let isFirstFrame = true
	const recordingLevelReader = toRecordingLevelReader({
		startedAt,
		onLevel,
		silenceThresholdSettings: NATIVE_SILENCE_THRESHOLD_SETTINGS,
	})

	// whether speech started, when the level was last above the silence threshold, whether the recorder has reported
	// recording, and how the recording ended
	let hasSpeechStarted = false
	let lastLoudAt = startedAt
	let hasRecordingStarted = false
	let recordingEnd: VoiceRecordingEnd | null = null

	// the phone has no voice activity detector, so the level's silence ends every recording
	const voiceActivityProgress: VoiceActivityProgress = {
		isListening: false,
		hasSpeechStarted: false,
		isSpeechEnded: false,
	}

	// end the recording once: stop the loop and the recorder, switch the audio mode back, then report the recording
	// or the cancel, deleting a cancelled recording's file
	const endRecording = async (nextRecordingEnd: VoiceRecordingEnd): Promise<void> => {
		if (recordingEnd !== null) {
			return
		}
		recordingEnd = nextRecordingEnd
		clearInterval(levelTimer)
		await recorder.stop().catch(() => {})
		await setIsRecordingAudioMode(false).catch(() => {})

		// read the recorder's file, release the recorder, and log the level trace
		const uri = recorder.uri
		recorder.release()
		traceLevel?.({
			platform,
			...recordingLevelReader.readAmbientSample(),
			peakLevel,
			recordingEnd: nextRecordingEnd,
		})

		// a sent recording reports its file, and any other end deletes it
		if (nextRecordingEnd === "send" && uri) {
			onFinished(toRecordingFilePart(uri), toSecondsRecorded(startedAt))
			return
		}

		// any other end deletes the file and reports the cancel. a sent recording with no file reads as interrupted
		if (uri) {
			deleteFile(uri)
		}
		onCancelled(nextRecordingEnd === "send" ? "interrupted" : nextRecordingEnd)
	}

	// read the recorder's status every 100 ms, set the silence threshold from the first reads, and decide whether the
	// recording goes on
	const readLevel = (): void => {
		const status = recorder.getStatus()
		const now = Date.now()

		// a recorder that stopped on its own ran to the limit or was interrupted
		const recorderStatusEnd = toRecorderStatusEnd(status, hasRecordingStarted)
		hasRecordingStarted ||= status.isRecording
		if (recorderStatusEnd) {
			void endRecording(recorderStatusEnd)
			return
		}

		// read the level and its peak. Android's first reading is always silence, so it is skipped
		const isSkippedFrame = isFirstFrame && platform === "android"
		isFirstFrame = false
		if (isSkippedFrame || !status.isRecording) {
			return
		}
		level = toLinearLevel(status.metering)
		peakLevel = Math.max(peakLevel, level)

		// set the meter, sample the room on the first reads, and decide on the later ones whether the recording goes on
		const silenceThreshold = recordingLevelReader.readLevel(level, now)
		if (silenceThreshold !== null) {
			decideRecording(silenceThreshold, now)
		}
	}

	// a loud read holds the silence off
	const decideRecording = (silenceThreshold: number, now: number): void => {
		const speechFrame = toSpeechFrame({
			level,
			silenceThreshold,
			hasSpeechStarted,
			hasLevelSpeechBeforeListening: false,
			voiceActivityProgress,
		})
		hasSpeechStarted = speechFrame.hasSpeechStarted
		if (speechFrame.isLoud) {
			lastLoudAt = now
		}

		// send once the user stops or the limit passes, and cancel if nobody spoke
		const recordingDecision = toRecordingDecision({ hasSpeechStarted, lastLoudAt, startedAt, now })
		if (recordingDecision !== "keep") {
			void endRecording(recordingDecision === "send" ? "send" : "noSpeech")
		}
	}

	// start the loop and return the controls
	const levelTimer = setInterval(readLevel, LEVEL_READ_MS)
	return { send: () => void endRecording("send"), cancel: () => void endRecording("user") }
}

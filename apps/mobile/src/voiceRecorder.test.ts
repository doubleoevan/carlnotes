// the phone's recorder: its options, the metering conversion, the interruption reading, the file part, and the level
// loop over a fake native recorder, from the permission to the sent or deleted file
import { afterEach, expect, jest, mock, test } from "bun:test"
import type { VoiceRecordingBody } from "@carlnotes/client/voiceClient"
import type { MobilePlatform } from "@carlnotes/contracts/clientTelemetry"
import type {
	VoiceRecorderAdapter,
	VoiceRecordingCancelReason,
	VoiceRecordingHandle,
} from "@carlnotes/core/lib/voiceRecorder"
import type { RecorderState } from "expo-audio"
import { type MicrophonePermission, MicrophoneRejectedError } from "./voicePermission"
import {
	LEVEL_READ_MS,
	type NativeVoiceRecorder,
	toLinearLevel,
	toPlatformRecordingOptions,
	toRecorderStatusEnd,
	toRecordingFilePart,
	toVoiceRecorderAdapter,
	VOICE_RECORDING_FILE_PREFIX,
} from "./voiceRecorder"

// the recording file that the fake recorder writes
const RECORDING_URI = "file:///cache/ExpoAudio/voice-recording-1.m4a"

// the adapter over a fake recorder, the fake's status, and what the adapter switched, created, and deleted
type FakeRecording = {
	adapter: VoiceRecorderAdapter
	recorder: NativeVoiceRecorder
	status: RecorderState
	audioModeSwitches: boolean[]
	deletedUris: string[]
	createdFileNames: unknown[]
}

// a started recording's handle and what it reported
type FakeRecordingReports = {
	handle: VoiceRecordingHandle
	finishedRecordings: { recording: VoiceRecordingBody; secondsRecorded: number }[]
	cancelReasons: VoiceRecordingCancelReason[]
	meterLevels: number[]
}

// the fake timers each loop test turns on
afterEach(() => {
	jest.useRealTimers()
})

test("the recording is mono AAC at 16 kHz in an m4a with metering on, in each platform's form", () => {
	// both platforms share the container, the rate, and the metering
	const iosOptions = toPlatformRecordingOptions("ios", "voice-recording-1")
	const androidOptions = toPlatformRecordingOptions("android", "voice-recording-1")
	for (const options of [iosOptions, androidOptions]) {
		expect(options).toMatchObject({
			extension: ".m4a",
			sampleRate: 16_000,
			numberOfChannels: 1,
			isMeteringEnabled: true,
			directory: "cache",
			fileName: "voice-recording-1",
		})
	}

	// iOS names the AAC format code, and Android the container and the encoder
	expect(iosOptions).toMatchObject({ outputFormat: "aac " })
	expect(androidOptions).toMatchObject({ outputFormat: "mpeg4", audioEncoder: "aac" })
})

test("toLinearLevel converts dBFS metering to a level, with no reading as silence", () => {
	expect(toLinearLevel(0)).toBe(1)
	expect(toLinearLevel(-20)).toBeCloseTo(0.1)
	expect(toLinearLevel(-160)).toBeCloseTo(0)
	expect(toLinearLevel(undefined)).toBe(0)
	expect(toLinearLevel(Number.NEGATIVE_INFINITY)).toBe(0)
})

test("toRecorderStatusEnd reads a recorder that stopped on its own as the limit or an interruption", () => {
	// a recorder still recording, or not started yet, ends nothing
	const recordingStatus = { isRecording: true, durationMillis: 2_000, mediaServicesDidReset: false }
	expect(toRecorderStatusEnd(recordingStatus, true)).toBeNull()
	expect(toRecorderStatusEnd({ ...recordingStatus, isRecording: false }, false)).toBeNull()

	// a stop before the limit is an interruption, a stop at the limit sends, and a media services reset interrupts
	expect(toRecorderStatusEnd({ ...recordingStatus, isRecording: false }, true)).toBe("interrupted")
	expect(toRecorderStatusEnd({ ...recordingStatus, isRecording: false, durationMillis: 59_800 }, true)).toBe("send")
	expect(toRecorderStatusEnd({ ...recordingStatus, mediaServicesDidReset: true }, true)).toBe("interrupted")
})

test("toRecordingFilePart names the recording's file part for the transcription post", () => {
	expect(toRecordingFilePart(RECORDING_URI)).toEqual({ uri: RECORDING_URI, name: "recording.mp4", type: "audio/mp4" })
})

/**
 * Returns the adapter over a fake recorder whose metering the test sets, with the files it deleted, the audio mode
 * switches, and the recorder's created options.
 */
function toFakeRecording({
	platform = "ios",
	microphonePermission = "granted",
}: {
	platform?: MobilePlatform
	microphonePermission?: MicrophonePermission
} = {}): FakeRecording {
	// the recorder's status, which the test moves, and what the adapter switched, created, and deleted
	const status: RecorderState = {
		canRecord: true,
		isRecording: true,
		durationMillis: 0,
		fileSize: 0,
		mediaServicesDidReset: false,
		metering: -60,
		url: RECORDING_URI,
	}
	const audioModeSwitches: boolean[] = []
	const deletedUris: string[] = []
	const createdFileNames: unknown[] = []

	// the fake native recorder
	const recorder: NativeVoiceRecorder = {
		uri: RECORDING_URI,
		prepareToRecordAsync: mock(async () => {}),
		record: mock(() => {}),
		stop: mock(async () => {}),
		getStatus: () => ({ ...status }),
		release: mock(() => {}),
	}

	// the adapter over it
	const adapter = toVoiceRecorderAdapter({
		platform,
		createRecorder: (options) => {
			createdFileNames.push(options.fileName)
			return recorder
		},
		requestMicrophone: async () => microphonePermission,
		setIsRecordingAudioMode: async (isRecording) => {
			audioModeSwitches.push(isRecording)
		},
		deleteFile: (uri) => deletedUris.push(uri),
		openSettings: () => {},
		subscribeToBackground: () => () => {},
	})
	return { adapter, recorder, status, audioModeSwitches, deletedUris, createdFileNames }
}

/**
 * Starts a recording on the fake, reporting into the arrays returned.
 */
async function startFakeRecording(fakeRecording: FakeRecording): Promise<FakeRecordingReports> {
	// what the recording reported
	const finishedRecordings: FakeRecordingReports["finishedRecordings"] = []
	const cancelReasons: VoiceRecordingCancelReason[] = []
	const meterLevels: number[] = []
	const handle = await fakeRecording.adapter.start({
		session: fakeRecording.adapter.openSession({ isPodcastEpisodeQuestion: false }),
		endOfSpeech: "level",
		onLevel: (meterLevel) => meterLevels.push(meterLevel),
		onFinished: (recording, secondsRecorded) => finishedRecordings.push({ recording, secondsRecorded }),
		onCancelled: (reason) => cancelReasons.push(reason),
	})
	return { handle, finishedRecordings, cancelReasons, meterLevels }
}

// let the loop read for a span, then let the recording's async end settle
async function advanceLoop(milliseconds: number): Promise<void> {
	for (let elapsed = 0; elapsed < milliseconds; elapsed += LEVEL_READ_MS) {
		jest.advanceTimersByTime(LEVEL_READ_MS)
		await Promise.resolve()
	}
	await new Promise<void>((resolve) => queueMicrotask(resolve))
	await Promise.resolve()
}

test("speech then a pause sends the recording's file, with the audio mode switched back", async () => {
	// a recording in a quiet room
	jest.useFakeTimers()
	const fakeRecording = toFakeRecording()
	const { finishedRecordings, cancelReasons, meterLevels } = await startFakeRecording(fakeRecording)
	expect(fakeRecording.audioModeSwitches).toEqual([true])
	expect(String(fakeRecording.createdFileNames[0])).toStartWith(VOICE_RECORDING_FILE_PREFIX)

	// the room's ambient level, then two seconds of speech, then the pause that ends it
	await advanceLoop(400)
	fakeRecording.status.metering = -12
	await advanceLoop(2_000)
	expect(meterLevels.length).toBeGreaterThan(0)
	fakeRecording.status.metering = -60
	await advanceLoop(1_800)

	// the file is sent, nothing was cancelled or deleted, and the recorder is released
	expect(finishedRecordings).toHaveLength(1)
	expect(finishedRecordings[0]?.recording).toEqual(toRecordingFilePart(RECORDING_URI))
	expect(cancelReasons).toEqual([])
	expect(fakeRecording.deletedUris).toEqual([])
	expect(fakeRecording.audioModeSwitches).toEqual([true, false])
	expect(fakeRecording.recorder.release).toHaveBeenCalledTimes(1)
})

test("eight quiet seconds cancel as no speech and delete the file", async () => {
	// a recording nobody speaks into
	jest.useFakeTimers()
	const fakeRecording = toFakeRecording({ platform: "android" })
	const { finishedRecordings, cancelReasons } = await startFakeRecording(fakeRecording)
	await advanceLoop(8_200)
	expect(cancelReasons).toEqual(["noSpeech"])
	expect(finishedRecordings).toEqual([])
	expect(fakeRecording.deletedUris).toEqual([RECORDING_URI])
})

test("a recorder the system stops reads as an interruption, and a cancel deletes the file", async () => {
	// the system stops the recorder mid-recording, as a phone call does
	jest.useFakeTimers()
	const interruptedRecording = toFakeRecording()
	const interruptedReports = await startFakeRecording(interruptedRecording)
	await advanceLoop(500)
	interruptedRecording.status.isRecording = false
	interruptedRecording.status.durationMillis = 500

	// the next read cancels it as interrupted and deletes its file
	await advanceLoop(200)
	expect(interruptedReports.cancelReasons).toEqual(["interrupted"])
	expect(interruptedRecording.deletedUris).toEqual([RECORDING_URI])

	// the user's cancel reports once, however often it is pressed
	const cancelledRecording = toFakeRecording()
	const cancelledReports = await startFakeRecording(cancelledRecording)
	cancelledReports.handle.cancel()
	cancelledReports.handle.cancel()

	// the cancel deletes the file and switches the audio mode back
	await advanceLoop(100)
	expect(cancelledReports.cancelReasons).toEqual(["user"])
	expect(cancelledRecording.deletedUris).toEqual([RECORDING_URI])
	expect(cancelledRecording.audioModeSwitches).toEqual([true, false])
})

test("a denied microphone throws before the audio mode switches, and its notice offers the settings for good", async () => {
	// the denial never makes a recorder
	const fakeRecording = toFakeRecording({ microphonePermission: "deniedForGood" })
	const error = await startFakeRecording(fakeRecording).catch((startError: unknown) => startError)
	expect(error).toBeInstanceOf(MicrophoneRejectedError)
	expect(fakeRecording.audioModeSwitches).toEqual([])
	expect(fakeRecording.createdFileNames).toEqual([])

	// the notice's action opens the settings
	expect(fakeRecording.adapter.toMicrophoneRejectedAction?.(error)?.label).toBe("Open settings")
})

test("deleteRecording removes a posted recording's file", () => {
	const fakeRecording = toFakeRecording()
	fakeRecording.adapter.deleteRecording?.(toRecordingFilePart(RECORDING_URI))
	expect(fakeRecording.deletedUris).toEqual([RECORDING_URI])
})

// core's recording and listen mode hooks over a fake recorder: the states from the tap to the transcript, listen
// mode's reopen and its endings, the rejected microphone, and the spoken questions cutoff
import { afterEach, expect, jest, type Mock, mock, spyOn, test } from "bun:test"
import type { SpokenQuestionsState } from "@carlnotes/contracts/chat"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { LISTEN_WAIT_TIMEOUT_MS, useListenMode } from "@carlnotes/core/hooks/useListenMode"
import { useVoiceRecording } from "@carlnotes/core/hooks/useVoiceRecording"
import { CHAT_REJECTION_COPY } from "@carlnotes/core/lib/chatRejectionCopy"
import type {
	StartVoiceRecordingOptions,
	VoiceRecorderAdapter,
	VoiceRecordingSession,
} from "@carlnotes/core/lib/voiceRecorder"
import type { SpokenAnswerEnd } from "@carlnotes/core/stores/spokenAnswerQueue"
import * as spokenAnswerStore from "@carlnotes/core/stores/spokenAnswerStore"
import { collectVoiceNotices } from "@carlnotes/core/stores/voiceTestFixtures"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// the page every recording posts for, and the recording the fake recorder finishes with
const VOICE_CHAT_PAGE: VoiceChatPage = { kind: "topic", topicId: "topic" }
const RECORDING = new Blob(["voice"], { type: "audio/webm" })

// a session whose calls are counted
type FakeVoiceRecordingSession = VoiceRecordingSession & { resume: Mock<() => void>; close: Mock<() => void> }

// a recording the fake recorder started, with its callbacks and its controls
type FakeRecording = {
	options: StartVoiceRecordingOptions<FakeVoiceRecordingSession>
	send: Mock<() => void>
	cancel: Mock<() => void>
}

// what each test mounted, unmounted after it, and the fetch, notices, and spies put back
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) {
		await cleanup()
	}
	globalThis.fetch = originalFetch
	jest.useRealTimers()
	mock.restore()
})

/**
 * Returns a recorder that records nothing: its send finishes with the recording and its cancel reports a user's cancel,
 * as the platforms' recorders do. It counts the recording sessions it opened, the recordings it started and deleted,
 * and holds the background listener.
 */
function toFakeRecorder({ isMicrophoneRejected = false }: { isMicrophoneRejected?: boolean } = {}) {
	// what the recorder opened, started, and deleted, and its background listener
	const voiceRecordingSessions: FakeVoiceRecordingSession[] = []
	const recordings: FakeRecording[] = []
	const deletedRecordings: unknown[] = []
	let backgroundListener: (() => void) | null = null

	// the recorder, which throws for a rejected microphone
	const recorder: VoiceRecorderAdapter<FakeVoiceRecordingSession> = {
		openSession: () => {
			const session: FakeVoiceRecordingSession = { resume: mock(() => {}), suspend: () => {}, close: mock(() => {}) }
			voiceRecordingSessions.push(session)
			return session
		},
		start: async (options) => {
			if (isMicrophoneRejected) {
				throw new Error("microphone rejected")
			}
			const fakeRecording: FakeRecording = {
				options,
				send: mock(() => options.onFinished(RECORDING, 3)),
				cancel: mock(() => options.onCancelled("user")),
			}
			recordings.push(fakeRecording)
			return { send: fakeRecording.send, cancel: fakeRecording.cancel }
		},
		deleteRecording: (recording) => deletedRecordings.push(recording),
		toMicrophoneRejectedAction: () => ({ label: "Open settings", onPress: () => {} }),
		subscribeToBackground: (listener) => {
			backgroundListener = listener
			return () => {
				backgroundListener = null
			}
		},
	}
	return {
		recorder,
		voiceRecordingSessions,
		recordings,
		deletedRecordings,
		leaveForeground: () => backgroundListener?.(),
	}
}

/**
 * Stubs the spoken questions read with a status and the transcription post with a transcript, and returns how many
 * transcriptions were posted.
 */
function stubVoiceRoutes({
	spokenQuestionsStatus = "allowed",
	transcript = "what changed this week",
}: {
	spokenQuestionsStatus?: SpokenQuestionsState["status"]
	transcript?: string
} = {}): { transcriptionCount: () => number } {
	// return each route's response by its path
	let transcriptionCount = 0
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input)
		if (url.endsWith("/api/chat/transcription")) {
			transcriptionCount += 1
			return Response.json({ transcript })
		}
		return Response.json({ status: spokenQuestionsStatus } satisfies SpokenQuestionsState)
	}) as unknown as typeof fetch
	return { transcriptionCount: () => transcriptionCount }
}

/**
 * Captures the listener that listen mode subscribes to spoken answer ends, and returns the call that reports an end.
 */
function captureSpokenAnswerEnd(): (spokenAnswerEnd: Omit<SpokenAnswerEnd, "spokenAnswerKey">) => Promise<void> {
	// the latest subscriber, which the mounted hook registered
	let spokenAnswerEndListener: ((spokenAnswerEnd: SpokenAnswerEnd) => void) | null = null
	spyOn(spokenAnswerStore, "subscribeToSpokenAnswerEnd").mockImplementation((listener) => {
		spokenAnswerEndListener = listener
		return () => {}
	})
	return async (spokenAnswerEnd) => {
		await act(async () => spokenAnswerEndListener?.({ spokenAnswerKey: "answer", ...spokenAnswerEnd }))
	}
}

/**
 * Mounts a composer's recording over the fake recorder, and returns the hook harness and the transcripts it sent.
 */
async function mountComposerRecording(fakeRecorder: ReturnType<typeof toFakeRecorder>) {
	// the transcripts the composer sends and the paused action's runs
	const transcripts: string[] = []
	const onSpokenQuestionsPaused = mock(() => {})
	const voiceRecordingHarness = await renderTestHook(() =>
		useVoiceRecording({
			page: VOICE_CHAT_PAGE,
			recorder: fakeRecorder.recorder,
			onTranscript: (transcript) => transcripts.push(transcript),
			onSpokenQuestionsPaused,
		}),
	)
	cleanups.push(voiceRecordingHarness.close)
	return { voiceRecordingHarness, transcripts, onSpokenQuestionsPaused }
}

test("a tap records, sends the transcript, deletes the recording, and reopens after carl's own answer ends", async () => {
	// the routes allow speaking, and carl's answer ends are reported by hand
	const voiceRoutes = stubVoiceRoutes()
	const reportSpokenAnswerEnd = captureSpokenAnswerEnd()
	const fakeRecorder = toFakeRecorder()
	const { voiceRecordingHarness, transcripts } = await mountComposerRecording(fakeRecorder)

	// the tap opens a session and asks for the microphone, and the bar replaces the box
	await act(async () => voiceRecordingHarness.read().start())
	await waitForHook(() => voiceRecordingHarness.read().state === "recording")
	expect(fakeRecorder.voiceRecordingSessions).toHaveLength(1)
	expect(voiceRecordingHarness.read().isListening).toBe(true)

	// the send posts the recording, sends its transcript, and deletes the recording
	await act(async () => voiceRecordingHarness.read().send())
	await waitForHook(() => transcripts.length === 1)
	expect(transcripts).toEqual(["what changed this week"])
	expect(voiceRoutes.transcriptionCount()).toBe(1)
	expect(fakeRecorder.deletedRecordings).toEqual([RECORDING])
	expect(voiceRecordingHarness.read().state).toBe("idle")

	// carl's own answer playing to its end reopens the mic on the same session, with no tap
	await reportSpokenAnswerEnd({ isPlayedToEnd: true, isAutoPlayed: true })
	await waitForHook(() => voiceRecordingHarness.read().state === "recording")
	expect(fakeRecorder.recordings).toHaveLength(2)
	expect(fakeRecorder.voiceRecordingSessions).toHaveLength(1)
})

test("a stopped answer ends listen mode and closes the session, and an answer played by its button changes nothing", async () => {
	// a sent transcript leaves listen mode waiting for carl
	stubVoiceRoutes()
	const reportSpokenAnswerEnd = captureSpokenAnswerEnd()
	const fakeRecorder = toFakeRecorder()
	const { voiceRecordingHarness, transcripts } = await mountComposerRecording(fakeRecorder)
	await act(async () => voiceRecordingHarness.read().start())
	await waitForHook(() => voiceRecordingHarness.read().state === "recording")
	await act(async () => voiceRecordingHarness.read().send())
	await waitForHook(() => transcripts.length === 1)

	// an answer the user played by its button leaves listen mode waiting
	await reportSpokenAnswerEnd({ isPlayedToEnd: true, isAutoPlayed: false })
	expect(voiceRecordingHarness.read().isListening).toBe(true)
	expect(fakeRecorder.recordings).toHaveLength(1)

	// carl's own answer stopped ends listen mode, closes the session, and reopens nothing
	await reportSpokenAnswerEnd({ isPlayedToEnd: false, isAutoPlayed: true })
	expect(voiceRecordingHarness.read().isListening).toBe(false)
	expect(fakeRecorder.voiceRecordingSessions[0]?.close).toHaveBeenCalledTimes(1)
	expect(fakeRecorder.recordings).toHaveLength(1)
})

test("a typed send ends listen mode, so carl's answer that follows stays quiet", async () => {
	// a sent transcript leaves listen mode waiting for carl
	stubVoiceRoutes()
	const reportSpokenAnswerEnd = captureSpokenAnswerEnd()
	const fakeRecorder = toFakeRecorder()
	const { voiceRecordingHarness, transcripts } = await mountComposerRecording(fakeRecorder)
	await act(async () => voiceRecordingHarness.read().start())
	await waitForHook(() => voiceRecordingHarness.read().state === "recording")
	await act(async () => voiceRecordingHarness.read().send())
	await waitForHook(() => transcripts.length === 1)

	// the typed send ends listen mode, and the answer's end opens no mic
	await act(async () => voiceRecordingHarness.read().stopListening())
	await reportSpokenAnswerEnd({ isPlayedToEnd: true, isAutoPlayed: true })
	expect(voiceRecordingHarness.read().isListening).toBe(false)
	expect(fakeRecorder.recordings).toHaveLength(1)
})

test("leaving the foreground cancels the running recording and ends listen mode with no notice", async () => {
	// a recording runs
	const voiceRoutes = stubVoiceRoutes()
	const { notices, unregister } = collectVoiceNotices()
	cleanups.push(unregister)
	const fakeRecorder = toFakeRecorder()
	const { voiceRecordingHarness } = await mountComposerRecording(fakeRecorder)
	await act(async () => voiceRecordingHarness.read().start())
	await waitForHook(() => voiceRecordingHarness.read().state === "recording")

	// the app leaves the foreground, which cancels the recording and posts nothing
	await act(async () => fakeRecorder.leaveForeground())
	expect(fakeRecorder.recordings[0]?.cancel).toHaveBeenCalledTimes(1)
	expect(voiceRecordingHarness.read().state).toBe("idle")
	expect(voiceRecordingHarness.read().isListening).toBe(false)
	expect(voiceRoutes.transcriptionCount()).toBe(0)
	expect(notices).toEqual([])
})

test("a rejected microphone shows the rejection with the platform's action and records nothing", async () => {
	// the platform rejects the microphone
	stubVoiceRoutes()
	const { notices, unregister } = collectVoiceNotices()
	cleanups.push(unregister)
	const fakeRecorder = toFakeRecorder({ isMicrophoneRejected: true })
	const { voiceRecordingHarness } = await mountComposerRecording(fakeRecorder)

	// the tap ends idle, with listen mode off and the rejection's notice
	await act(async () => voiceRecordingHarness.read().start())
	await waitForHook(() => notices.length === 1)
	expect(notices).toEqual(["Carl can't hear you. Type it, he reads fast. [Open settings]"])
	expect(voiceRecordingHarness.read().state).toBe("idle")
	expect(voiceRecordingHarness.read().isListening).toBe(false)
})

test("the spoken questions cutoff runs the paused action and a spent budget shows its line, with nothing recorded", async () => {
	// the tap's spoken questions read returns the cutoff
	stubVoiceRoutes({ spokenQuestionsStatus: "paused" })
	const { notices, unregister } = collectVoiceNotices()
	cleanups.push(unregister)
	const fakeRecorder = toFakeRecorder()
	const { voiceRecordingHarness, onSpokenQuestionsPaused } = await mountComposerRecording(fakeRecorder)
	await act(async () => voiceRecordingHarness.read().start())
	await waitForHook(() => onSpokenQuestionsPaused.mock.calls.length === 1)
	expect(fakeRecorder.recordings).toHaveLength(0)
	expect(voiceRecordingHarness.read().state).toBe("idle")

	// a spent budget, in a composer with no budget notice of its own, shows the budget's line
	stubVoiceRoutes({ spokenQuestionsStatus: "budget" })
	await act(async () => voiceRecordingHarness.read().start())
	await waitForHook(() => notices.length === 1)
	expect(notices).toEqual([CHAT_REJECTION_COPY.budget])
	expect(fakeRecorder.recordings).toHaveLength(0)
})

test("an empty transcript says carl didn't catch that and ends listen mode", async () => {
	// the transcript comes back blank
	stubVoiceRoutes({ transcript: "  " })
	const { notices, unregister } = collectVoiceNotices()
	cleanups.push(unregister)
	const fakeRecorder = toFakeRecorder()
	const { voiceRecordingHarness, transcripts } = await mountComposerRecording(fakeRecorder)
	await act(async () => voiceRecordingHarness.read().start())
	await waitForHook(() => voiceRecordingHarness.read().state === "recording")

	// the send posts it, sends nothing, and says so
	await act(async () => voiceRecordingHarness.read().send())
	await waitForHook(() => notices.length === 1)
	expect(notices).toEqual(["Carl didn't catch that. Please try again."])
	expect(transcripts).toEqual([])
	expect(voiceRecordingHarness.read().isListening).toBe(false)
	expect(fakeRecorder.deletedRecordings).toEqual([RECORDING])
})

test("listen mode gives up after two minutes of waiting for carl's answer", async () => {
	// listen mode started on a recording session of its own
	captureSpokenAnswerEnd()
	const onReopen = mock(() => {})
	const listenModeHarness = await renderTestHook(() => useListenMode<FakeVoiceRecordingSession>(onReopen))
	cleanups.push(listenModeHarness.close)
	const session: FakeVoiceRecordingSession = { resume: mock(() => {}), suspend: () => {}, close: mock(() => {}) }
	await act(async () => listenModeHarness.read().startListening(session))

	// the wait starts once the transcript is sent, and ends listen mode once two minutes pass with no answer end
	jest.useFakeTimers()
	await act(async () => listenModeHarness.read().waitForSpokenAnswer())
	await act(async () => {
		jest.advanceTimersByTime(LISTEN_WAIT_TIMEOUT_MS - 1)
	})
	expect(listenModeHarness.read().isListening).toBe(true)
	await act(async () => {
		jest.advanceTimersByTime(1)
	})
	jest.useRealTimers()
	expect(listenModeHarness.read().isListening).toBe(false)
	expect(session.close).toHaveBeenCalledTimes(1)
	expect(onReopen).not.toHaveBeenCalled()
})

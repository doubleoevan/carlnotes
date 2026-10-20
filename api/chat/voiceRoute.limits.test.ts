// the voice routes' limits: the process's transcode limit, a user's spoken parts in progress, and the two limiters'
// rate limit windows
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient } from "../../db/redisClientStub"
import * as speech from "../../worker/speech"
import { CALLER_RATE_LIMIT, SPEECH_RATE_LIMIT } from "../rateLimit"
import { toJsonRequest } from "../testSession"
import {
	SPOKEN_PARTS_IN_PROGRESS_LIMIT,
	TRANSCODE_CONCURRENCY_LIMIT,
	VOICE_SPEECH_PATH,
	VOICE_TRANSCRIPTION_PATH,
} from "./voiceRoute"
import {
	allowVoicePage,
	RECORDED_SPOKEN_ANSWER,
	stubTranscription,
	TOPIC_PAGE,
	toSignedInVoiceApp,
	toTranscriptionRequest,
	WAV_BYTES,
	waitForCallCount,
} from "./voiceRouteTestFixtures"

// put the spies and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// the process transcodes at most its limit of recordings at once, rejects the next with a retry, and frees a slot
// when a transcode finishes
test("a recording past the process's transcode limit is rejected with a retry", async () => {
	allowVoicePage()
	const { transcodeRecordingSpy } = stubTranscription({
		outcome: "transcribed",
		transcript: "hi",
		inputTokens: 1,
		outputTokens: 1,
	})
	const transcodeRelease = Promise.withResolvers<void>()
	transcodeRecordingSpy.mockImplementation(async () => {
		await transcodeRelease.promise
		return WAV_BYTES
	})
	const signedInApp = toSignedInVoiceApp()

	// fill the limit with transcodes that wait
	const waitingResponses = Array.from({ length: TRANSCODE_CONCURRENCY_LIMIT }, () =>
		signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE)),
	)
	await waitForCallCount(transcodeRecordingSpy, TRANSCODE_CONCURRENCY_LIMIT)

	// the next recording is rejected with a retry, and never transcoded
	const busyResponse = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(busyResponse.status).toBe(503)
	expect(busyResponse.headers.get("Retry-After")).toBe("5")
	expect(transcodeRecordingSpy).toHaveBeenCalledTimes(TRANSCODE_CONCURRENCY_LIMIT)

	// the waiting transcodes finish, and the next recording is transcoded again
	transcodeRelease.resolve()
	const finishedStatuses = await Promise.all(waitingResponses.map(async (response) => (await response).status))
	expect(finishedStatuses).toEqual(Array(TRANSCODE_CONCURRENCY_LIMIT).fill(200))
	const freedResponse = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(freedResponse.status).toBe(200)
})

// a user has at most the limit of spoken parts in progress, the next is rejected, and a finished spoken part frees a
// slot
test("a spoken part past the user's in-progress limit is rejected", async () => {
	allowVoicePage()
	const speechRelease = Promise.withResolvers<void>()
	const recordSpokenAnswerSpy = spyOn(speech, "recordSpokenAnswer").mockImplementation(async () => {
		await speechRelease.promise
		return RECORDED_SPOKEN_ANSWER
	})
	const signedInApp = toSignedInVoiceApp()

	// fill the user's limit with spoken parts that wait
	const waitingResponses = Array.from({ length: SPOKEN_PARTS_IN_PROGRESS_LIMIT }, () =>
		signedInApp.request(VOICE_SPEECH_PATH, toJsonRequest({ page: TOPIC_PAGE, text: "Hi." })),
	)
	await waitForCallCount(recordSpokenAnswerSpy, SPOKEN_PARTS_IN_PROGRESS_LIMIT)

	// the next spoken part is rejected, and never spoken
	const limitedResponse = await signedInApp.request(VOICE_SPEECH_PATH, toJsonRequest({ page: TOPIC_PAGE, text: "Hi." }))
	expect(limitedResponse.status).toBe(429)
	expect(await limitedResponse.json()).toEqual({ error: "rate limited" })
	expect(recordSpokenAnswerSpy).toHaveBeenCalledTimes(SPOKEN_PARTS_IN_PROGRESS_LIMIT)

	// the waiting spoken parts finish, and the next spoken part is spoken again
	speechRelease.resolve()
	const finishedStatuses = await Promise.all(waitingResponses.map(async (response) => (await response).status))
	expect(finishedStatuses).toEqual(Array(SPOKEN_PARTS_IN_PROGRESS_LIMIT).fill(200))
	const freedResponse = await signedInApp.request(VOICE_SPEECH_PATH, toJsonRequest({ page: TOPIC_PAGE, text: "Hi." }))
	expect(freedResponse.status).toBe(200)
})

// the transcription route spends the tool callers' limit, one hit per spoken question, and the speech route has its
// own larger rate limit window, so a long reply's spoken parts never trip the chat's limit
test("the transcription route spends the tool callers' limit and the speech route spends its own", async () => {
	allowVoicePage()
	stubTranscription({ outcome: "transcribed", transcript: "hi", inputTokens: 1, outputTokens: 1 })
	spyOn(speech, "recordSpokenAnswer").mockResolvedValue(RECORDED_SPOKEN_ANSWER)
	const signedInApp = toSignedInVoiceApp()

	// the recordings up to the limit pass, and the next is rejected
	const transcriptionStatuses: number[] = []
	for (let i = 0; i < CALLER_RATE_LIMIT + 1; i++) {
		const response = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
		transcriptionStatuses.push(response.status)
	}
	expect(transcriptionStatuses.slice(0, CALLER_RATE_LIMIT)).toEqual(Array(CALLER_RATE_LIMIT).fill(200))
	expect(transcriptionStatuses.at(-1)).toBe(429)

	// the spoken parts have their own rate limit window, untouched by the recordings above
	const speechStatuses: number[] = []
	let lastSpeechResponse: Response | undefined
	for (let i = 0; i < SPEECH_RATE_LIMIT + 1; i++) {
		lastSpeechResponse = await signedInApp.request(VOICE_SPEECH_PATH, toJsonRequest({ page: TOPIC_PAGE, text: "Hi." }))
		speechStatuses.push(lastSpeechResponse.status)
	}

	// the spoken part past the limit is rejected
	expect(speechStatuses.slice(0, SPEECH_RATE_LIMIT)).toEqual(Array(SPEECH_RATE_LIMIT).fill(200))
	expect(speechStatuses.at(-1)).toBe(429)
	expect(await lastSpeechResponse?.json()).toEqual({ error: "rate limited" })
})

// voice route tests for the reservations: a transcription and a spoken part each reserve their largest cost, a reached
// budget rejects them before any model is called, and a call that starts releases its reservation after its spend row
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient } from "@carlnotes/db/redisClientStub"
import * as speech from "@carlnotes/models/speech"
import { toJsonRequest } from "../testSession"
import { VOICE_SPEECH_PATH, VOICE_TRANSCRIPTION_PATH } from "./voiceRoute"
import {
	allowVoicePage,
	stubTranscription,
	TOPIC_PAGE,
	toSignedInVoiceApp,
	toTranscriptionRequest,
} from "./voiceRouteTestFixtures"

// put the spies and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// a recording or a spoken part whose user's spend and open reservations have reached the budget is rejected as a spent
// budget before any model is called, and one that starts releases its reservation after its spend row
test("a voice call reserves its largest cost, and a reached budget rejects it before any model is called", async () => {
	// every reservation is rejected
	const { recordChatSpendRowSpy, reserveUserSpendSpy, reservation } = allowVoicePage()
	const { transcribeRecordingSpy } = stubTranscription({
		outcome: "transcribed",
		transcript: "who is hiring?",
		inputTokens: 320,
		outputTokens: 10,
	})
	const recordSpokenAnswerSpy = spyOn(speech, "recordSpokenAnswer")
	reserveUserSpendSpy.mockResolvedValue("rejected")

	// both routes reject with the spent budget's status, priced by their own call kind, and call no model
	const app = toSignedInVoiceApp()
	const transcriptionResponse = await app.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	const speechResponse = await app.request(VOICE_SPEECH_PATH, toJsonRequest({ page: TOPIC_PAGE, text: "Four." }))
	expect([transcriptionResponse.status, speechResponse.status]).toEqual([402, 402])
	expect(reserveUserSpendSpy.mock.calls.map(([options]) => options.kind)).toEqual(["transcription", "speech"])
	expect(transcribeRecordingSpy).not.toHaveBeenCalled()
	expect(recordSpokenAnswerSpy).not.toHaveBeenCalled()

	// a transcription that starts records its spend row, then releases its reservation
	reserveUserSpendSpy.mockResolvedValue(reservation)
	expect((await app.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))).status).toBe(200)
	expect(recordChatSpendRowSpy).toHaveBeenCalledTimes(1)
	expect(reservation.release).toHaveBeenCalledTimes(1)
})

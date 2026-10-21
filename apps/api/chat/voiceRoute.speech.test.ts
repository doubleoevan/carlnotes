// voice route tests for the spoken part: spoken on the user's key in the answering speaker's voice, recorded as chat
// spend, returned as an MP3 or a WAV, and rejected with its failure if the proxy turns it down
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient } from "@carlnotes/db/redisClientStub"
import { speechCost } from "@carlnotes/models/budget"
import * as speech from "@carlnotes/models/speech"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { toJsonRequest } from "../testSession"
import { VOICE_SPEECH_PATH } from "./voiceRoute"
import {
	allowVoicePage,
	MP3_BYTES,
	RECORDED_SPOKEN_ANSWER,
	TOPIC_PAGE,
	toSignedInVoiceApp,
	WAV_BYTES,
} from "./voiceRouteTestFixtures"

// put the spies and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// a spoken part is spoken on the user's key, recorded as chat spend on the standard tier, and answered as an MP3 that
// no cache may keep
test("a spoken part is spoken and answered as an MP3 with a chat spend row", async () => {
	const { recordChatSpendRowSpy } = allowVoicePage()
	const recordSpokenAnswerSpy = spyOn(speech, "recordSpokenAnswer").mockResolvedValue(RECORDED_SPOKEN_ANSWER)
	const response = await toSignedInVoiceApp().request(
		VOICE_SPEECH_PATH,
		toJsonRequest({ page: TOPIC_PAGE, text: "Four of them are hiring." }),
	)
	expect(response.status).toBe(200)
	expect(response.headers.get("Content-Type")).toBe("audio/mpeg")
	expect(response.headers.get("Cache-Control")).toBe("private, no-store")
	expect(new Uint8Array(await response.arrayBuffer())).toEqual(MP3_BYTES)

	// the spoken part went to the model on the user's key, and the spend row prices it on the spoken answer's tier
	expect(recordSpokenAnswerSpy).toHaveBeenCalledWith({
		text: "Four of them are hiring.",
		speaker: "host",
		litellmApiKey: "sk-user",
	})
	expect(recordChatSpendRowSpy).toHaveBeenCalledWith({
		kind: "speech",
		userId: "user-1",
		page: TOPIC_PAGE,
		cost: speechCost({ speechTier: speech.SPOKEN_ANSWER_SPEECH_TIER, inputTokens: 50, audioTokens: 400 }),
		totalTokens: 450,
	})
})

// a reply vienna gave from the podcast player is spoken in her voice
test("a spoken part names its speaker, so vienna's reply is spoken in her voice", async () => {
	allowVoicePage()
	const recordSpokenAnswerSpy = spyOn(speech, "recordSpokenAnswer").mockResolvedValue(RECORDED_SPOKEN_ANSWER)
	const response = await toSignedInVoiceApp().request(
		VOICE_SPEECH_PATH,
		toJsonRequest({ page: TOPIC_PAGE, text: "Because you follow it.", speaker: "cohost" }),
	)
	expect(response.status).toBe(200)
	expect(recordSpokenAnswerSpy).toHaveBeenCalledWith({
		text: "Because you follow it.",
		speaker: "cohost",
		litellmApiKey: "sk-user",
	})
})

// a spoken part whose MP3 encode failed after the paid call is answered as the WAV the speech model returned
test("a spoken part whose MP3 encode failed is answered as a WAV", async () => {
	allowVoicePage()
	spyOn(speech, "recordSpokenAnswer").mockResolvedValue({
		...RECORDED_SPOKEN_ANSWER,
		audioBytes: WAV_BYTES,
		audioContentType: "audio/wav",
	})
	const response = await toSignedInVoiceApp().request(
		VOICE_SPEECH_PATH,
		toJsonRequest({ page: TOPIC_PAGE, text: "Hi." }),
	)
	expect(response.status).toBe(200)
	expect(response.headers.get("Content-Type")).toBe("audio/wav")
	expect(response.headers.get("Cache-Control")).toBe("private, no-store")
	expect(new Uint8Array(await response.arrayBuffer())).toEqual(WAV_BYTES)
})

// a speech call the proxy turns down answers by why, as a transcription does
test("a spoken part the proxy turns down answers by its failure", async () => {
	allowVoicePage()
	quietErrorReports()
	const recordSpokenAnswerSpy = spyOn(speech, "recordSpokenAnswer").mockResolvedValue({
		outcome: "budget-spent",
		reason: "Budget has been exceeded",
	})
	const signedInApp = toSignedInVoiceApp()
	const budgetResponse = await signedInApp.request(VOICE_SPEECH_PATH, toJsonRequest({ page: TOPIC_PAGE, text: "Hi." }))
	expect(budgetResponse.status).toBe(402)
	expect(await budgetResponse.json()).toEqual({ error: "budget exhausted" })

	// a rate limited proxy
	recordSpokenAnswerSpy.mockResolvedValue({ outcome: "retryable", httpStatus: 429, reason: "rate limited" })
	const retryableResponse = await signedInApp.request(
		VOICE_SPEECH_PATH,
		toJsonRequest({ page: TOPIC_PAGE, text: "Hi." }),
	)
	expect(retryableResponse.status).toBe(503)
	expect(retryableResponse.headers.get("Retry-After")).toBe("5")
})

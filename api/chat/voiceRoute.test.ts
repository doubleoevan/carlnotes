// voice route tests: each route's gates, the spoken questions cutoff and its read with the budget check, the recording's
// body limit and its form, the transcript with its spend row, the silent recording, and the failure reports
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { SPOKEN_QUESTIONS_PAUSED_ERROR } from "@shared/contracts/chat"
import { quietErrorReports } from "@shared/monitoringTestFixtures"
import * as monthlyBudgetCutoffs from "../../db/monthlyBudgetCutoffs"
import { restoreRedisClient } from "../../db/redisClientStub"
import { transcriptionCost } from "../../worker/budget"
import * as litellm from "../../worker/litellm"
import * as speech from "../../worker/speech"
import * as transcription from "../../worker/transcription"
import * as authorization from "../authorization"
import { VOICE_RECORDING_BODY_LIMIT_BYTES } from "../bodyLimit"
import { toJsonRequest } from "../testSession"
import { SIGNUP_REQUIRED_ERROR } from "./chatTurnAuthorization"
import * as voiceAuthorization from "./voiceAuthorization"
import { SPOKEN_EVENTS_PATH, SPOKEN_QUESTIONS_PATH, VOICE_SPEECH_PATH, VOICE_TRANSCRIPTION_PATH } from "./voiceRoute"
import {
	allowVoicePage,
	RECORDING_BYTES,
	ROOM_PAGE,
	stubTranscription,
	TOPIC_PAGE,
	toSignedInVoiceApp,
	toTranscriptionRequest,
	toVisitorVoiceApp,
	WAV_BYTES,
} from "./voiceRouteTestFixtures"

// put the spies and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// a visitor is rejected on every route with the chat's sign-up error, before a recording is ever read
test("a visitor's voice request is rejected before its body is read", async () => {
	const visitorApp = toVisitorVoiceApp()
	const { transcodeRecordingSpy } = stubTranscription({
		outcome: "transcribed",
		transcript: "hi",
		inputTokens: 1,
		outputTokens: 1,
	})
	const authorizeVoiceChatPageSpy = spyOn(voiceAuthorization, "authorizeVoiceChatPage")

	// a recording past the body limit still gets the 401, never a 413
	const oversizedRecording = await visitorApp.request(VOICE_TRANSCRIPTION_PATH, {
		method: "POST",
		headers: { "content-type": "multipart/form-data; boundary=x" },
		body: "x".repeat(VOICE_RECORDING_BODY_LIMIT_BYTES + 1),
	})
	expect(oversizedRecording.status).toBe(401)
	expect(await oversizedRecording.json()).toEqual({ error: SIGNUP_REQUIRED_ERROR })

	// the speech and the events routes answer the same
	for (const [path, body] of [
		[VOICE_SPEECH_PATH, { page: TOPIC_PAGE, text: "Four of them." }],
		[SPOKEN_EVENTS_PATH, { page: TOPIC_PAGE, event: { kind: "answer_played" } }],
	] as const) {
		const response = await visitorApp.request(path, toJsonRequest(body))
		expect(response.status).toBe(401)
	}
	expect(transcodeRecordingSpy).not.toHaveBeenCalled()
	expect(authorizeVoiceChatPageSpy).not.toHaveBeenCalled()
})

// a signed-in user's recording past the limit is rejected before the route reads it
test("a recording past the body limit is rejected with a 413", async () => {
	const response = await toSignedInVoiceApp().request(VOICE_TRANSCRIPTION_PATH, {
		method: "POST",
		headers: { "content-type": "multipart/form-data; boundary=x" },
		body: "x".repeat(VOICE_RECORDING_BODY_LIMIT_BYTES + 1),
	})
	expect(response.status).toBe(413)
	expect(await response.json()).toEqual({ error: "That recording is too long." })
})

// a recording is transcoded, transcribed on the user's key, recorded as chat spend on its page, and answered
test("a recording becomes a transcript and a chat spend row", async () => {
	const { recordChatSpendRowSpy, loadOrProvisionUserLiteLLMKeySpy } = allowVoicePage()
	const { transcodeRecordingSpy, transcribeRecordingSpy } = stubTranscription({
		outcome: "transcribed",
		transcript: "who is hiring?",
		inputTokens: 320,
		outputTokens: 10,
	})
	const response = await toSignedInVoiceApp().request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(ROOM_PAGE))
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ transcript: "who is hiring?" })

	// the recording's bytes went to ffmpeg, and the WAV went to the model on the user's key
	expect(transcodeRecordingSpy).toHaveBeenCalledWith(RECORDING_BYTES)
	expect(loadOrProvisionUserLiteLLMKeySpy).toHaveBeenCalledWith("user-1")
	expect(transcribeRecordingSpy).toHaveBeenCalledWith({ audioBytes: WAV_BYTES, litellmApiKey: "sk-user" })

	// the spend row names its kind, the user, the page, the call's cost, and its tokens
	expect(recordChatSpendRowSpy).toHaveBeenCalledWith({
		kind: "transcription",
		userId: "user-1",
		page: ROOM_PAGE,
		cost: transcriptionCost({ inputTokens: 320, outputTokens: 10 }),
		totalTokens: 330,
	})
})

// a transcript with no words was still paid for, so it answers 200 with an empty transcript and records the spend
test("an empty transcript answers 200 and records the spend", async () => {
	const { recordChatSpendRowSpy } = allowVoicePage()
	stubTranscription({ outcome: "transcribed", transcript: "", inputTokens: 64, outputTokens: 0 })
	const response = await toSignedInVoiceApp().request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ transcript: "" })
	expect(recordChatSpendRowSpy).toHaveBeenCalledTimes(1)
})

// a recording with no samples called no model, so it answers 200 with an empty transcript and records no spend
test("a silent recording answers 200 with an empty transcript and no spend row", async () => {
	const { recordChatSpendRowSpy } = allowVoicePage()
	stubTranscription({ outcome: "silent" })
	const response = await toSignedInVoiceApp().request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ transcript: "" })
	expect(recordChatSpendRowSpy).not.toHaveBeenCalled()
})

// a transcription was paid for before its spend row is written, so a row that cannot be written is logged and
// reported, and the transcript still returns
test("a transcript still returns if its spend row cannot be recorded", async () => {
	const { recordChatSpendRowSpy } = allowVoicePage()
	stubTranscription({ outcome: "transcribed", transcript: "who is hiring?", inputTokens: 320, outputTokens: 10 })
	const reportErrorSpy = quietErrorReports()
	const insertError = new Error("connection closed")
	recordChatSpendRowSpy.mockRejectedValue(insertError)

	// the transcript returns, and the failed insert is reported with the user and the call
	const response = await toSignedInVoiceApp().request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ transcript: "who is hiring?" })
	expect(reportErrorSpy).toHaveBeenCalledWith(insertError, "chat", { userId: "user-1", modelCall: "transcription" })
})

// each rejection the page's gate gives answers as the chat turn would, and no model is called
test("a page the user may not talk on is rejected before any model is called", async () => {
	const authorizeVoiceChatPageSpy = spyOn(voiceAuthorization, "authorizeVoiceChatPage")
	const { transcodeRecordingSpy } = stubTranscription({
		outcome: "transcribed",
		transcript: "hi",
		inputTokens: 1,
		outputTokens: 1,
	})
	const recordSpokenAnswerSpy = spyOn(speech, "recordSpokenAnswer")
	const signedInApp = toSignedInVoiceApp()

	// a spent budget is the chat's rejection on the transcription route
	authorizeVoiceChatPageSpy.mockResolvedValue({ status: "budget", userId: "user-1" })
	const budgetResponse = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(budgetResponse.status).toBe(402)
	expect(await budgetResponse.json()).toEqual({ error: "budget exhausted" })

	// a forbidden page and a missing chat room answer the speech route as the chat turn and the chat room post do
	authorizeVoiceChatPageSpy.mockResolvedValue({ status: "forbidden" })
	const forbiddenResponse = await signedInApp.request(
		VOICE_SPEECH_PATH,
		toJsonRequest({ page: TOPIC_PAGE, text: "Hi." }),
	)
	expect(forbiddenResponse.status).toBe(403)
	authorizeVoiceChatPageSpy.mockResolvedValue({ status: "notFound" })
	const notFoundResponse = await signedInApp.request(VOICE_SPEECH_PATH, toJsonRequest({ page: ROOM_PAGE, text: "Hi." }))
	expect(notFoundResponse.status).toBe(404)
	expect(transcodeRecordingSpy).not.toHaveBeenCalled()
	expect(recordSpokenAnswerSpy).not.toHaveBeenCalled()
})

// past the spoken questions cutoff, a recording is rejected with the cutoff's own 402 before it is transcoded or
// transcribed
test("a spoken question past the spoken questions cutoff is rejected before any model is called", async () => {
	// a page that allows user-1, whose spend is past the cutoff
	const app = toSignedInVoiceApp()
	allowVoicePage()
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(
		true,
	)
	const { transcodeRecordingSpy, transcribeRecordingSpy } = stubTranscription({ outcome: "silent" })

	// the transcription is rejected with the cutoff's error, and nothing was transcoded or transcribed
	const transcriptionResponse = await app.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(transcriptionResponse.status).toBe(402)
	expect(await transcriptionResponse.json()).toEqual({ error: SPOKEN_QUESTIONS_PAUSED_ERROR })
	expect(isMonthlyBudgetCutoffPassedSpy).toHaveBeenCalledWith("user-1", "spokenQuestions")
	expect(transcodeRecordingSpy).not.toHaveBeenCalled()
	expect(transcribeRecordingSpy).not.toHaveBeenCalled()
})

// the spoken questions read says budget for a spent budget even past the cutoff, paused past the cutoff, and allowed
// under it
test("the spoken questions read returns budget, paused, or allowed", async () => {
	// user-1's budget is spent and their spend is past the cutoff
	const app = toSignedInVoiceApp()
	const isMonthlySpendExhaustedSpy = spyOn(authorization, "isMonthlySpendExhausted").mockResolvedValue(true)
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(
		true,
	)

	// a spent budget says budget, though the cutoff is passed too
	const budgetResponse = await app.request(SPOKEN_QUESTIONS_PATH)
	expect(await budgetResponse.json()).toEqual({ status: "budget" })
	expect(isMonthlySpendExhaustedSpy).toHaveBeenCalledWith("user-1")

	// a budget with room left says paused past the cutoff
	isMonthlySpendExhaustedSpy.mockResolvedValue(false)
	const pausedResponse = await app.request(SPOKEN_QUESTIONS_PATH)
	expect(await pausedResponse.json()).toEqual({ status: "paused" })
	expect(isMonthlyBudgetCutoffPassedSpy).toHaveBeenCalledWith("user-1", "spokenQuestions")

	// spend under the cutoff says allowed
	isMonthlyBudgetCutoffPassedSpy.mockResolvedValue(false)
	const allowedResponse = await app.request(SPOKEN_QUESTIONS_PATH)
	expect(await allowedResponse.json()).toEqual({ status: "allowed" })
})

// the spoken questions read starts the cutoff check before the budget check returns, so the two checks run together
test("the spoken questions read starts the budget check and the cutoff check together", async () => {
	// a budget check that logs when it starts and when it returns a moment later
	const app = toSignedInVoiceApp()
	const checkEvents: string[] = []
	spyOn(authorization, "isMonthlySpendExhausted").mockImplementation(async () => {
		checkEvents.push("budget check started")
		await Promise.resolve()
		checkEvents.push("budget check returned")
		return false
	})

	// a cutoff check that logs when it starts
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockImplementation(async () => {
		checkEvents.push("cutoff check started")
		return false
	})

	// the cutoff check started while the budget check was still running
	const response = await app.request(SPOKEN_QUESTIONS_PATH)
	expect(await response.json()).toEqual({ status: "allowed" })
	expect(checkEvents).toEqual(["budget check started", "cutoff check started", "budget check returned"])
})

// a visitor has no spend, so the spoken questions read asks them to sign up before it reads any spend
test("a visitor's spoken questions read is rejected", async () => {
	const isMonthlySpendExhaustedSpy = spyOn(authorization, "isMonthlySpendExhausted")
	const response = await toVisitorVoiceApp().request(SPOKEN_QUESTIONS_PATH)
	expect(response.status).toBe(401)
	expect(await response.json()).toEqual({ error: SIGNUP_REQUIRED_ERROR })
	expect(isMonthlySpendExhaustedSpy).not.toHaveBeenCalled()
})

// a transcription post with no page, a page that is not one, or no recording is a bad request
test("a transcription post needs a page and a recording", async () => {
	allowVoicePage()
	const signedInApp = toSignedInVoiceApp()
	const noPageResponse = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest({ kind: "nope" }))
	expect(noPageResponse.status).toBe(400)

	// a page with no recording
	const pageOnlyForm = new FormData()
	pageOnlyForm.set("page", JSON.stringify(TOPIC_PAGE))
	const noRecordingResponse = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, {
		method: "POST",
		body: pageOnlyForm,
	})
	expect(noRecordingResponse.status).toBe(400)
})

// a transcription post whose body is not a form parses as empty, so it is a bad request and never an error to report
test("a transcription post that is not a form is a bad request", async () => {
	allowVoicePage()
	const reportErrorSpy = quietErrorReports()
	const response = await toSignedInVoiceApp().request(VOICE_TRANSCRIPTION_PATH, toJsonRequest({ page: TOPIC_PAGE }))
	expect(response.status).toBe(400)
	expect(reportErrorSpy).not.toHaveBeenCalled()
})

// a recording ffmpeg cannot read is the browser's to retry, and is never reported or transcribed
test("a recording that cannot be transcoded is rejected with a 422", async () => {
	allowVoicePage()
	spyOn(console, "error").mockImplementation(() => {})
	spyOn(transcription, "transcodeRecording").mockRejectedValue(new Error("ffmpeg exited with 1: invalid data"))
	const transcribeRecordingSpy = spyOn(transcription, "transcribeRecording")

	// the recording is rejected, and the model never sees it
	const signedInApp = toSignedInVoiceApp()
	const response = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(response.status).toBe(422)
	expect(transcribeRecordingSpy).not.toHaveBeenCalled()

	// the failed transcode gave its slot back, so the next recording is not told the process is busy
	const nextResponse = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(nextResponse.status).toBe(422)
})

// a model call the proxy turns down answers by why: a spent key is 402, a failure a retry can fix is 503 with a retry,
// and any other rejection is 502, with no spend row for any of them
test("a transcription the proxy turns down answers by its failure", async () => {
	const { recordChatSpendRowSpy } = allowVoicePage()
	quietErrorReports()
	const { transcribeRecordingSpy } = stubTranscription({ outcome: "budget-spent", reason: "Budget has been exceeded" })
	const signedInApp = toSignedInVoiceApp()
	const budgetResponse = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(budgetResponse.status).toBe(402)
	expect(await budgetResponse.json()).toEqual({ error: "budget exhausted" })

	// a rate limited proxy
	transcribeRecordingSpy.mockResolvedValue({ outcome: "retryable", httpStatus: 429, reason: "rate limited" })
	const retryableResponse = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(retryableResponse.status).toBe(503)
	expect(retryableResponse.headers.get("Retry-After")).toBe("5")

	// any other rejection
	transcribeRecordingSpy.mockResolvedValue({ outcome: "rejected", httpStatus: 400, reason: "bad audio" })
	const rejectedResponse = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(rejectedResponse.status).toBe(502)
	expect(recordChatSpendRowSpy).not.toHaveBeenCalled()
})

// each voice model failure is reported under a fixed message per model call and outcome, with the proxy's reason, the
// outcome, and the http status in the extra fields, and a spent budget is never reported
test("a voice model failure is reported, and a spent budget is not", async () => {
	allowVoicePage()
	const reportErrorSpy = quietErrorReports()
	const { transcribeRecordingSpy } = stubTranscription({ outcome: "budget-spent", reason: "Budget has been exceeded" })
	const recordSpokenAnswerSpy = spyOn(speech, "recordSpokenAnswer").mockResolvedValue({
		outcome: "budget-spent",
		reason: "Budget has been exceeded",
	})
	const signedInApp = toSignedInVoiceApp()

	// a spent budget on either route is never reported
	await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	await signedInApp.request(VOICE_SPEECH_PATH, toJsonRequest({ page: TOPIC_PAGE, text: "Hi." }))
	expect(reportErrorSpy).not.toHaveBeenCalled()

	// a rejected transcription and a retryable spoken part are each reported under their own message
	transcribeRecordingSpy.mockResolvedValue({ outcome: "rejected", httpStatus: 400, reason: "bad audio" })
	recordSpokenAnswerSpy.mockResolvedValue({ outcome: "retryable", httpStatus: null, reason: "fetch failed" })
	await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	await signedInApp.request(VOICE_SPEECH_PATH, toJsonRequest({ page: TOPIC_PAGE, text: "Hi." }))
	expect(reportErrorSpy.mock.calls.map(([error, stage, extra]) => [(error as Error).message, stage, extra])).toEqual([
		[
			"transcription rejected",
			"chat",
			{ modelCall: "transcription", outcome: "rejected", httpStatus: "400", reason: "bad audio" },
		],
		[
			"speech retryable",
			"chat",
			{ modelCall: "speech", outcome: "retryable", httpStatus: "none", reason: "fetch failed" },
		],
	])
})

// a key the proxy could not load answers as a failure a retry can fix, on both model routes, with no model called
test("a key the proxy could not load answers 503 with a retry on both routes", async () => {
	allowVoicePage()
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockRejectedValue(new Error("the proxy is down"))
	const reportErrorSpy = quietErrorReports()
	const { transcribeRecordingSpy } = stubTranscription({
		outcome: "transcribed",
		transcript: "hi",
		inputTokens: 1,
		outputTokens: 1,
	})
	const recordSpokenAnswerSpy = spyOn(speech, "recordSpokenAnswer")
	const signedInApp = toSignedInVoiceApp()

	// the recording is transcoded and then turned away with a retry
	const transcriptionResponse = await signedInApp.request(VOICE_TRANSCRIPTION_PATH, toTranscriptionRequest(TOPIC_PAGE))
	expect(transcriptionResponse.status).toBe(503)
	expect(transcriptionResponse.headers.get("Retry-After")).toBe("5")
	expect(transcribeRecordingSpy).not.toHaveBeenCalled()

	// the spoken part is turned away the same way, and each failure is reported under its model call
	const speechResponse = await signedInApp.request(VOICE_SPEECH_PATH, toJsonRequest({ page: TOPIC_PAGE, text: "Hi." }))
	expect(speechResponse.status).toBe(503)
	expect(speechResponse.headers.get("Retry-After")).toBe("5")
	expect(recordSpokenAnswerSpy).not.toHaveBeenCalled()
	expect(reportErrorSpy.mock.calls.map((reportCall) => String(reportCall[0]))).toEqual([
		"Error: transcription retryable",
		"Error: speech retryable",
	])
})

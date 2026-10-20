// the voice route tests' shared setup: the pages and bytes the cases send, the recorded spoken answer, the wait for
// calls in progress, the route signed in and as a visitor over a fake Redis, the transcription request builder, and the
// spies that allow a page and stub a transcription
import { spyOn } from "bun:test"
import { Hono } from "hono"
import * as monthlyBudgetCutoffs from "../../db/monthlyBudgetCutoffs"
import { stubRedisClient } from "../../db/redisClientStub"
import * as litellm from "../../worker/litellm"
import type { SpokenAnswerResult } from "../../worker/speech"
import * as transcription from "../../worker/transcription"
import type { AppEnv } from "../currentUser"
import { toSignedInApp } from "../testSession"
import * as chatTurns from "./chatTurns"
import * as voiceAuthorization from "./voiceAuthorization"
import { voiceRoute } from "./voiceRoute"

// the pages the cases send
export const TOPIC_PAGE = { kind: "topic", topicId: "topic-1" } as const
export const ROOM_PAGE = { kind: "room", topicId: "topic-1", teamId: "team-1" } as const

// the bytes the cases record, transcode, and speak
export const RECORDING_BYTES = new Uint8Array([1, 2, 3, 4])
export const WAV_BYTES = new Uint8Array([82, 73, 70, 70, 0, 0])
export const MP3_BYTES = new Uint8Array([73, 68, 51, 4, 0, 0])

// a spoken answer recorded as an MP3, with the token counts that price it
export const RECORDED_SPOKEN_ANSWER: Extract<SpokenAnswerResult, { outcome: "recorded" }> = {
	outcome: "recorded",
	audioBytes: MP3_BYTES,
	audioContentType: "audio/mpeg",
	inputTokens: 50,
	audioTokens: 400,
}

// wait until the spy has been called the given number of times, so the cases can keep calls in progress
export async function waitForCallCount(spy: { mock: { calls: unknown[] } }, callCount: number): Promise<void> {
	while (spy.mock.calls.length < callCount) {
		await Bun.sleep(1)
	}
}

// the route with user-1 signed in, over a fake Redis for the limiters
export function toSignedInVoiceApp(): Hono<AppEnv> {
	stubRedisClient()
	return toSignedInApp(voiceRoute, "user-1")
}

// the route with nobody signed in
export function toVisitorVoiceApp(): Hono<AppEnv> {
	stubRedisClient()
	return new Hono<AppEnv>().route("/", voiceRoute)
}

// a transcription post: the page as json and the recording as a file, in one multipart body
export function toTranscriptionRequest(page: unknown, recordingBytes: Uint8Array = RECORDING_BYTES): RequestInit {
	const formData = new FormData()
	formData.set("page", JSON.stringify(page))
	formData.set("recording", new File([recordingBytes as BlobPart], "recording.webm", { type: "audio/webm" }))
	return { method: "POST", body: formData }
}

// allow every page for user-1 under the chat turn gate and the access check, with spend under the spoken questions
// cutoff and sk-user as the key, and return the spies the cases read
export function allowVoicePage(): {
	recordChatSpendRowSpy: ReturnType<typeof spyOn<typeof chatTurns, "recordChatSpendRow">>
	loadOrProvisionUserLiteLLMKeySpy: ReturnType<typeof spyOn<typeof litellm, "loadOrProvisionUserLiteLLMKey">>
} {
	spyOn(voiceAuthorization, "authorizeVoiceChatPage").mockResolvedValue({ status: "allowed", userId: "user-1" })
	spyOn(voiceAuthorization, "authorizeVoiceChatPageAccess").mockResolvedValue({ status: "allowed", userId: "user-1" })
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(false)
	return {
		loadOrProvisionUserLiteLLMKeySpy: spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-user"),
		recordChatSpendRowSpy: spyOn(chatTurns, "recordChatSpendRow").mockResolvedValue(undefined),
	}
}

// a transcode that returns the WAV, and a transcription that returns the given result
export function stubTranscription(transcriptionResult: transcription.TranscriptionResult): {
	transcodeRecordingSpy: ReturnType<typeof spyOn<typeof transcription, "transcodeRecording">>
	transcribeRecordingSpy: ReturnType<typeof spyOn<typeof transcription, "transcribeRecording">>
} {
	return {
		transcodeRecordingSpy: spyOn(transcription, "transcodeRecording").mockResolvedValue(WAV_BYTES),
		transcribeRecordingSpy: spyOn(transcription, "transcribeRecording").mockResolvedValue(transcriptionResult),
	}
}

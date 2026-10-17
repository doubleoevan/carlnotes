// the voice client: the page a private chat names, how each route's status is read, the one retry, and the question
// event's shape
import { expect, test } from "bun:test"
import {
	fetchSpokenAnswerAudio,
	sendTranscription,
	toRecordingFileName,
	toRetryDelayMs,
	toSpokenQuestionEvent,
	toVoiceChatPage,
} from "./voiceClient"

// a 503 that asks for no wait, so a retry test runs at once
function toRetryNowResponse(): Response {
	return new Response(null, { status: 503, headers: { "Retry-After": "0" } })
}

// make one call against a stubbed fetch that returns these responses in turn, or throws the error in a response's
// place, and return the call's result with how many fetches it made. the real fetch goes back after
async function withFetchResponses<T>(
	responses: (Response | Error)[],
	call: () => Promise<T>,
): Promise<{ result: T; fetchCount: number }> {
	// the stub returns the responses in turn and repeats the last one
	const originalFetch = globalThis.fetch
	let fetchCount = 0
	globalThis.fetch = (async () => {
		const response = responses[Math.min(fetchCount, responses.length - 1)]
		fetchCount += 1

		// an error in a response's place is a network failure
		if (response instanceof Error) {
			throw response
		}
		return response
	}) as unknown as typeof fetch

	// make the call, then put the real fetch back
	try {
		return { result: await call(), fetchCount }
	} finally {
		globalThis.fetch = originalFetch
	}
}

// make one call against a stubbed fetch that returns this response
async function withFetchResponse<T>(response: Response, call: () => Promise<T>): Promise<T> {
	return (await withFetchResponses([response], call)).result
}

// each private chat page maps to the voice page kind the api authorizes it as
test("toVoiceChatPage names the topic, the team, or the new-topic chat", () => {
	expect(toVoiceChatPage({ topicId: "topic-1" })).toEqual({ kind: "topic", topicId: "topic-1" })
	expect(toVoiceChatPage({ teamId: "team-1" })).toEqual({ kind: "team", teamId: "team-1" })
	expect(toVoiceChatPage({ newTopic: true })).toEqual({ kind: "newTopic" })
})

// the recording posts under the name of the container the browser recorded
test("toRecordingFileName names the container", () => {
	expect(toRecordingFileName("audio/mp4")).toBe("recording.mp4")
	expect(toRecordingFileName("audio/webm;codecs=opus")).toBe("recording.webm")
})

// a transcript comes back as is, an empty one included, and a failed status reads as the chat's rejection
test("sendTranscription returns the transcript or the chat rejection", async () => {
	const page = { kind: "topic", topicId: "topic-1" } as const
	const recording = new Blob(["bytes"], { type: "audio/webm;codecs=opus" })
	const sendTranscriptionResult = await withFetchResponse(Response.json({ transcript: "" }), () =>
		sendTranscription({ page, recording }),
	)
	expect(sendTranscriptionResult).toEqual({ transcript: "" })

	// a spent budget, the rate limit, and a page the user may not chat on each read as their rejection
	expect(
		await withFetchResponse(new Response(null, { status: 402 }), () => sendTranscription({ page, recording })),
	).toBe("budget")
	expect(
		await withFetchResponse(new Response(null, { status: 429 }), () => sendTranscription({ page, recording })),
	).toBe("rateLimited")
	expect(
		await withFetchResponse(new Response(null, { status: 404 }), () => sendTranscription({ page, recording })),
	).toBe("forbidden")
	expect(await withFetchResponse(toRetryNowResponse(), () => sendTranscription({ page, recording }))).toBe("failed")
})

// a 503 is tried once more, and the retry's transcript comes back
test("sendTranscription retries a 503 once", async () => {
	const page = { kind: "topic", topicId: "topic-1" } as const
	const recording = new Blob(["bytes"], { type: "audio/webm;codecs=opus" })
	const { result, fetchCount } = await withFetchResponses(
		[toRetryNowResponse(), Response.json({ transcript: "hello" })],
		() => sendTranscription({ page, recording }),
	)
	expect(result).toEqual({ transcript: "hello" })
	expect(fetchCount).toBe(2)
})

// a 200 is the audio, and a failed status reads as its rejection, so the queue tells a spent budget from the rest
test("fetchSpokenAnswerAudio returns the audio or the rejection", async () => {
	const page = { kind: "room", topicId: null, teamId: "team-1" } as const
	const spokenAnswerAudio = await withFetchResponse(
		new Response(new Uint8Array([255, 251]), { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
		() => fetchSpokenAnswerAudio({ page, text: "hello" }),
	)
	expect(spokenAnswerAudio).toBeInstanceOf(Blob)

	// a spent budget, the rate limit, and a failed speech call each read as their rejection, with no retry
	const budgetResult = await withFetchResponses([new Response(null, { status: 402 })], () =>
		fetchSpokenAnswerAudio({ page, text: "hi" }),
	)
	expect(budgetResult).toEqual({ result: "budget", fetchCount: 1 })
	expect(
		await withFetchResponse(new Response(null, { status: 429 }), () => fetchSpokenAnswerAudio({ page, text: "hi" })),
	).toBe("rateLimited")
	expect(
		await withFetchResponse(new Response(null, { status: 502 }), () => fetchSpokenAnswerAudio({ page, text: "hi" })),
	).toBe("failed")
})

// a 503 or a network failure is tried once more, and a second failure reads as failed
test("fetchSpokenAnswerAudio retries a 503 or a network failure once", async () => {
	const page = { kind: "room", topicId: null, teamId: "team-1" } as const
	const audioResponse = (): Response => new Response(new Uint8Array([255, 251]), { status: 200 })
	const retriedResult = await withFetchResponses([toRetryNowResponse(), audioResponse()], () =>
		fetchSpokenAnswerAudio({ page, text: "hi" }),
	)
	expect(retriedResult.result).toBeInstanceOf(Blob)
	expect(retriedResult.fetchCount).toBe(2)

	// two 503s in a row fail after the one retry
	const failedResult = await withFetchResponses([toRetryNowResponse(), toRetryNowResponse()], () =>
		fetchSpokenAnswerAudio({ page, text: "hi" }),
	)
	expect(failedResult).toEqual({ result: "failed", fetchCount: 2 })

	// a network failure waits the default second, then retries
	const networkResult = await withFetchResponses([new TypeError("offline"), audioResponse()], () =>
		fetchSpokenAnswerAudio({ page, text: "hi" }),
	)
	expect(networkResult.result).toBeInstanceOf(Blob)
	expect(networkResult.fetchCount).toBe(2)
})

// the retry waits the Retry-After seconds, at most five, and a second without a response or a named wait
test("toRetryDelayMs reads Retry-After within five seconds", () => {
	const retryAfterResponse = (retryAfter: string): Response =>
		new Response(null, { status: 503, headers: { "Retry-After": retryAfter } })
	expect(toRetryDelayMs(retryAfterResponse("2"))).toBe(2_000)
	expect(toRetryDelayMs(retryAfterResponse("120"))).toBe(5_000)
	expect(toRetryDelayMs(new Response(null, { status: 503 }))).toBe(1_000)
	expect(toRetryDelayMs(null)).toBe(1_000)
})

// the question event includes the first spoken word's delay only if the reply played
test("toSpokenQuestionEvent measures the first word from the recording's send", () => {
	const spokenQuestionTimings = { secondsRecorded: 4, transcriptionMs: 900, recordingSentAt: 1_000 }
	expect(toSpokenQuestionEvent(spokenQuestionTimings, 3_500)).toEqual({
		kind: "question",
		secondsRecorded: 4,
		transcriptionMs: 900,
		firstSpokenWordMs: 2_500,
	})
	expect(toSpokenQuestionEvent(spokenQuestionTimings, null)).toEqual({
		kind: "question",
		secondsRecorded: 4,
		transcriptionMs: 900,
	})
})

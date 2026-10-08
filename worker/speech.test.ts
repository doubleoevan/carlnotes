// speech tests: the request body, the flex tier, how a failed call is sorted, the pass-through call, an empty model
import { afterEach, expect, test } from "bun:test"
import type { PodcastEpisodeTurn } from "@shared/contracts"
import { recordSpeech, toFailedSpeechResult, toSpeechRequestBody } from "./speech"

// the real fetch and env to put back after each test
const realFetch = globalThis.fetch
const realEnv = {
	PODCAST_SPEECH_MODEL: Bun.env.PODCAST_SPEECH_MODEL,
	LITELLM_BASE_URL: Bun.env.LITELLM_BASE_URL,
	LITELLM_MASTER_KEY: Bun.env.LITELLM_MASTER_KEY,
}

// put fetch and the env back, removing a value that was unset
afterEach(() => {
	globalThis.fetch = realFetch

	// assigning undefined would store the text "undefined", so an unset value is deleted
	for (const [name, value] of Object.entries(realEnv)) {
		if (value === undefined) {
			delete Bun.env[name]
		} else {
			Bun.env[name] = value
		}
	}
})

// two turns, one from each speaker, the second with a style
const TURNS: PodcastEpisodeTurn[] = [
	{ speaker: "host", text: "Three reviews landed this week." },
	{ speaker: "cohost", text: "Okay, <laugh> and why do I care?", style: "curious" },
]

test("a request has one part per turn and both speakers' voices", () => {
	// one part per turn, labeled with its speaker and its style
	const speechRequestBody = toSpeechRequestBody(TURNS, "standard") as {
		contents: { parts: unknown[] }[]
		generationConfig: { responseModalities: string[]; speechConfig: { multiSpeakerVoiceConfig: unknown } }
	}
	expect(speechRequestBody.contents[0]?.parts).toEqual([
		{ text: "Three reviews landed this week.", speech_metadata: { speaker: "host" } },
		{ text: "Okay, <laugh> and why do I care?", speech_metadata: { speaker: "cohost", style: "curious" } },
	])

	// audio output, with the default voice of each speaker
	expect(speechRequestBody.generationConfig.responseModalities).toEqual(["AUDIO"])
	expect(speechRequestBody.generationConfig.speechConfig.multiSpeakerVoiceConfig).toEqual({
		speakerVoiceConfigs: [
			{ speaker: "host", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Alnilam" } } },
			{ speaker: "cohost", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Laomedeia" } } },
		],
	})
})

// only a flex call names a service tier
test("a flex request selects the flex tier, and a standard request names none", () => {
	expect(toSpeechRequestBody(TURNS, "flex").service_tier).toBe("flex")
	expect("service_tier" in toSpeechRequestBody(TURNS, "standard")).toBe(false)
})

// a rate limit and a 5xx retry, a spent key budget does not, and any other rejection is final
test("a failed call is sorted into retryable, budget-spent, or rejected", () => {
	expect(toFailedSpeechResult(429, '{"error":"rate limit"}').outcome).toBe("retryable")
	expect(toFailedSpeechResult(503, "overloaded").outcome).toBe("retryable")
	expect(toFailedSpeechResult(429, '{"error":{"type":"budget_exceeded"}}').outcome).toBe("budget-spent")
	expect(toFailedSpeechResult(400, "Budget has been exceeded! Current cost: 3.1").outcome).toBe("budget-spent")
	expect(toFailedSpeechResult(400, "invalid voice").outcome).toBe("rejected")
})

test("a call posts to the pass-through on the key and returns the audio with its token counts", async () => {
	// the default speech model, a test proxy url, a WAV payload, and a list of the requests sent
	delete Bun.env.PODCAST_SPEECH_MODEL
	Bun.env.LITELLM_BASE_URL = "http://proxy.test"
	const wavBase64 = Buffer.from("RIFF....WAVEfmt ").toString("base64")
	const sentRequests: { url: string; apiKey: string | undefined }[] = []

	// a fetch that records the call and returns one audio part with its usage
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		const requestHeaders = (init?.headers ?? {}) as Record<string, string>
		sentRequests.push({ url: String(url), apiKey: requestHeaders["x-goog-api-key"] })

		// one audio part and the usage that prices it
		const speechResponseBody = {
			candidates: [{ content: { parts: [{ inlineData: { data: wavBase64, mimeType: "audio/wav" } }] } }],
			usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 250 },
		}
		return new Response(JSON.stringify(speechResponseBody), { status: 200 })
	}) as typeof fetch

	// the result is the audio and its tokens, sent to the model's pass-through url on the user's key
	const recordSpeechResult = await recordSpeech({ turns: TURNS, speechTier: "flex", litellmApiKey: "sk-user" })
	expect(recordSpeechResult).toMatchObject({ outcome: "recorded", inputTokens: 40, audioTokens: 250 })
	expect(sentRequests).toEqual([
		{ url: "http://proxy.test/gemini/v1beta/models/gemini-3.8-flash-tts:generateContent", apiKey: "sk-user" },
	])
})

// with the speech model set empty, the call is rejected without reaching the proxy
test("a call with the speech model set empty is rejected", async () => {
	Bun.env.PODCAST_SPEECH_MODEL = ""
	expect((await recordSpeech({ turns: TURNS, speechTier: "standard" })).outcome).toBe("rejected")
})

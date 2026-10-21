// speech tests: the two request bodies, the flex tier, how a failed call is sorted, the pass-through calls, a spoken
// answer's MP3 and its WAV fallback, an empty model
import { afterEach, expect, test } from "bun:test"
import type { PodcastEpisodeTurn } from "@carlnotes/contracts/payloads"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import {
	recordSpeech,
	recordSpokenAnswer,
	toModelCallFailure,
	toSpeechRequestBody,
	toSpokenAnswerRequestBody,
} from "./speech"

// the real fetch and env to put back after each test
const realFetch = globalThis.fetch
const restoreEnvSettings = saveEnvSettings(["PODCAST_SPEECH_MODEL", "LITELLM_BASE_URL", "LITELLM_MASTER_KEY"])

// put fetch and the env back, removing a value that was unset
afterEach(() => {
	globalThis.fetch = realFetch
	restoreEnvSettings()
})

// two turns, one from each speaker, the second with a style
const TURNS: PodcastEpisodeTurn[] = [
	{ speaker: "host", text: "Three reviews came out this week." },
	{ speaker: "cohost", text: "Okay, <laugh> and why do I care?", style: "curious" },
]

// the host's default voice config, which a spoken answer names alone
const HOST_VOICE_CONFIG = { prebuiltVoiceConfig: { voiceName: "Alnilam" } }

// one request that a stubbed fetch recorded. its url, the key header, and the parsed body
type SentSpeechRequest = { url: string; apiKey: string | undefined; requestBody: Record<string, unknown> }

// a WAV header with no format ffmpeg can read, which the stub returns unless it is given audio
const UNREADABLE_WAV = Buffer.from("RIFF....WAVEfmt ")

// stub fetch with one that records each call into the list and returns one audio part with its usage
function stubSpeechFetch(sentRequests: SentSpeechRequest[], audioBytes: Uint8Array = UNREADABLE_WAV): void {
	const wavBase64 = Buffer.from(audioBytes).toString("base64")
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		// record the call
		const requestHeaders = (init?.headers ?? {}) as Record<string, string>
		const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
		sentRequests.push({ url: String(url), apiKey: requestHeaders["x-goog-api-key"], requestBody })

		// one audio part and the usage that prices it
		const speechResponseBody = {
			candidates: [{ content: { parts: [{ inlineData: { data: wavBase64, mimeType: "audio/wav" } }] } }],
			usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 250 },
		}
		return new Response(JSON.stringify(speechResponseBody), { status: 200 })
	}) as typeof fetch
}

test("a request has one part per turn and both speakers' voices", () => {
	// one part per turn, labeled with its speaker and its style
	const speechRequestBody = toSpeechRequestBody(TURNS, "standard") as {
		contents: { parts: unknown[] }[]
		generationConfig: { responseModalities: string[]; speechConfig: { multiSpeakerVoiceConfig: unknown } }
	}
	expect(speechRequestBody.contents[0]?.parts).toEqual([
		{ text: "Three reviews came out this week.", speech_metadata: { speaker: "host" } },
		{ text: "Okay, <laugh> and why do I care?", speech_metadata: { speaker: "cohost", style: "curious" } },
	])

	// audio output, with the default voice of each speaker
	expect(speechRequestBody.generationConfig.responseModalities).toEqual(["AUDIO"])
	expect(speechRequestBody.generationConfig.speechConfig.multiSpeakerVoiceConfig).toEqual({
		speakerVoiceConfigs: [
			{ speaker: "host", voiceConfig: HOST_VOICE_CONFIG },
			{ speaker: "cohost", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Laomedeia" } } },
		],
	})
})

test("a spoken answer's request has one part in the host's voice alone, with no service tier", () => {
	// the text as the one part, audio output, and the host's voice with no speaker label
	const spokenAnswerRequestBody = toSpokenAnswerRequestBody("Three reviews came out this week.", "host")
	expect(spokenAnswerRequestBody).toEqual({
		contents: [{ role: "user", parts: [{ text: "Three reviews came out this week." }] }],
		generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: HOST_VOICE_CONFIG } },
	})
})

// vienna's answer to a question asked from the podcast player is spoken in the co-host's voice alone
test("a spoken answer vienna gave names the co-host's voice alone", () => {
	const spokenAnswerRequestBody = toSpokenAnswerRequestBody("Because you follow it.", "cohost")
	expect(spokenAnswerRequestBody).toEqual({
		contents: [{ role: "user", parts: [{ text: "Because you follow it." }] }],
		generationConfig: {
			responseModalities: ["AUDIO"],
			speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Laomedeia" } } },
		},
	})
})

// only a flex call names a service tier
test("a flex request selects the flex tier, and a standard request names none", () => {
	expect(toSpeechRequestBody(TURNS, "flex").service_tier).toBe("flex")
	expect("service_tier" in toSpeechRequestBody(TURNS, "standard")).toBe(false)
})

// a rate limit and a 5xx retry, a spent key budget does not, and any other rejection is final
test("a failed call is sorted into retryable, budget-spent, or rejected", () => {
	expect(toModelCallFailure(429, '{"error":"rate limit"}').outcome).toBe("retryable")
	expect(toModelCallFailure(503, "overloaded").outcome).toBe("retryable")
	expect(toModelCallFailure(429, '{"error":{"type":"budget_exceeded"}}').outcome).toBe("budget-spent")
	expect(toModelCallFailure(400, "Budget has been exceeded! Current cost: 3.1").outcome).toBe("budget-spent")
	expect(toModelCallFailure(400, "invalid voice").outcome).toBe("rejected")
})

test("a call posts to the pass-through on the key and returns the audio with its token counts", async () => {
	// the default speech model, a test proxy url, and a list of the requests sent
	delete Bun.env.PODCAST_SPEECH_MODEL
	Bun.env.LITELLM_BASE_URL = "http://proxy.test"
	const sentRequests: SentSpeechRequest[] = []
	stubSpeechFetch(sentRequests)

	// the result is the audio and its tokens, sent to the model's pass-through url on the user's key
	const recordSpeechResult = await recordSpeech({ turns: TURNS, speechTier: "flex", litellmApiKey: "sk-user" })
	expect(recordSpeechResult).toMatchObject({ outcome: "recorded", inputTokens: 40, audioTokens: 250 })
	expect(sentRequests).toMatchObject([
		{ url: "http://proxy.test/gemini/v1beta/models/gemini-3.8-flash-tts:generateContent", apiKey: "sk-user" },
	])
	expect(sentRequests[0]?.requestBody.service_tier).toBe("flex")
})

test("a spoken answer posts to the same route on the key with no service tier", async () => {
	// the default speech model, a test proxy url, and a list of the requests sent
	delete Bun.env.PODCAST_SPEECH_MODEL
	Bun.env.LITELLM_BASE_URL = "http://proxy.test"
	const sentRequests: SentSpeechRequest[] = []
	stubSpeechFetch(sentRequests)

	// the result is the audio and its tokens, sent to the same pass-through url on the user's key.
	// the stub's audio does not encode, so the result is the WAV, and the failed encode is reported under its fixed
	// message
	const reportErrorSpy = quietErrorReports()
	const recordSpokenAnswerResult = await recordSpokenAnswer({ text: "Three reviews.", litellmApiKey: "sk-user" })
	expect(recordSpokenAnswerResult).toMatchObject({
		outcome: "recorded",
		audioContentType: "audio/wav",
		inputTokens: 40,
		audioTokens: 250,
	})
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(String(reportErrorSpy.mock.calls[0]?.[0])).toContain("spoken answer mp3 encode failed")
	expect(sentRequests).toMatchObject([
		{ url: "http://proxy.test/gemini/v1beta/models/gemini-3.8-flash-tts:generateContent", apiKey: "sk-user" },
	])
	expect("service_tier" in (sentRequests[0]?.requestBody ?? {})).toBe(false)
})

// the encode needs ffmpeg, which the runtime image has and a developer's machine may not
test.skipIf(!Bun.which("ffmpeg"))("a spoken answer returns the speech as an MP3", async () => {
	// a tenth of a second of 24 kHz silence as the speech call's raw samples
	delete Bun.env.PODCAST_SPEECH_MODEL
	Bun.env.LITELLM_BASE_URL = "http://proxy.test"
	stubSpeechFetch([], new Uint8Array(4800))

	// the result is an MP3, which ffmpeg starts with an ID3 tag, and the call's tokens
	const recordSpokenAnswerResult = await recordSpokenAnswer({ text: "Three reviews.", litellmApiKey: "sk-user" })
	expect(recordSpokenAnswerResult).toMatchObject({
		outcome: "recorded",
		audioContentType: "audio/mpeg",
		inputTokens: 40,
		audioTokens: 250,
	})
	const audioBytes = recordSpokenAnswerResult.outcome === "recorded" ? recordSpokenAnswerResult.audioBytes : null
	expect(new TextDecoder().decode(audioBytes?.subarray(0, 3))).toBe("ID3")
})

// with the speech model set empty, the call is rejected without reaching the proxy
test("a call with the speech model set empty is rejected", async () => {
	Bun.env.PODCAST_SPEECH_MODEL = ""
	expect((await recordSpeech({ turns: TURNS, speechTier: "standard" })).outcome).toBe("rejected")
	expect((await recordSpokenAnswer({ text: "Three reviews." })).outcome).toBe("rejected")
})

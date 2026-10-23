// speech from Gemini through LiteLLM's pass-through route, billed to the virtual key that sends the call.
// a podcast chapter is a two-speaker call that returns a WAV, and a spoken chat reply is a single-speaker call in the
// answering host's voice that returns an MP3

import { type PodcastEpisodeSpeaker, podcastEpisodeSpeakers } from "@carlnotes/contracts/enums"
import type { PodcastEpisodeTurn } from "@carlnotes/contracts/payloads"
import { reportError } from "@carlnotes/server/monitoring"
import { podcastEpisodeSpeechModel } from "@carlnotes/server/podcastEpisodeSettings"
import { isRetryableHttpStatus } from "@carlnotes/server/publicFetch"
import { type SpeechTier, speechCost, toEstimatedTokens } from "./budget"
import { runFfmpeg } from "./ffmpeg"

// one chapter's speech call. its turns, its tier, and the virtual key that it bills, or the master key if no key is
// given
export type RecordSpeechOptions = { turns: PodcastEpisodeTurn[]; speechTier: SpeechTier; litellmApiKey?: string }

// one spoken answer's speech call. its text, the host whose voice speaks it, and the virtual key that it bills.
// the host is carl if no speaker is given, and the key is the master key if no key is given
export type RecordSpokenAnswerOptions = { text: string; speaker?: PodcastEpisodeSpeaker; litellmApiKey?: string }

// how a model call through the proxy fails
export type ModelCallFailure =
	// a failure that a retry can fix. a rate limit, a 5xx, a response with no result, a timeout, or a network failure
	| { outcome: "retryable"; httpStatus: number | null; reason: string }
	// the key's budget is spent, and no retry this month can fix a spent budget
	| { outcome: "budget-spent"; reason: string }
	// any other rejection
	| { outcome: "rejected"; httpStatus: number | null; reason: string }

// the result of one speech call. the audio as a WAV file, with the token counts that price it, or how the call failed
export type SpeechResult =
	| { outcome: "recorded"; audioBytes: Uint8Array; inputTokens: number; audioTokens: number }
	| ModelCallFailure

// the result of one spoken answer's speech call. the audio with its content type, an MP3, or the WAV if the MP3 encode
// failed after the paid call, with the token counts that price it, or how the call failed
export type SpokenAnswerResult =
	| { outcome: "recorded"; audioBytes: Uint8Array; audioContentType: string; inputTokens: number; audioTokens: number }
	| ModelCallFailure

// the tier a spoken answer is recorded on. a reply is spoken at once, so it never waits on the flex tier
export const SPOKEN_ANSWER_SPEECH_TIER: SpeechTier = "standard"

// Gemini's speech audio tokens a second, and the slowest pace a spoken part is read at in characters a second.
// the request sets no audio limit, so the slowest pace bounds how long a spoken part's audio can run
const SPEECH_AUDIO_TOKENS_PER_SECOND = 25
const SLOWEST_SPOKEN_CHARS_PER_SECOND = 10

// how long one podcast call may take. Google recommends ten minutes or more for flex, which waits for capacity
const SPEECH_TIMEOUT_MS: Record<SpeechTier, number> = { standard: 3 * 60 * 1000, flex: 12 * 60 * 1000 }

// how long one spoken answer's call may take, under Cloudflare's 100 second limit on a proxied request
const SPOKEN_ANSWER_TIMEOUT_MS = 90 * 1000

// how long a spoken answer's MP3 encode may take before the WAV is returned instead
const SPOKEN_ANSWER_ENCODE_TIMEOUT_MS = 5 * 1000

// the MP3 encode's arguments. the WAV on ffmpeg's input pipe, and a 64 kbps mono MP3 on its output pipe, written in
// large chunks instead of one pipe write a frame
const SPOKEN_ANSWER_MP3_ARGUMENTS = [
	"-f",
	"wav",
	"-i",
	"pipe:0",
	"-c:a",
	"libmp3lame",
	"-b:a",
	"64k",
	"-flush_packets",
	"0",
	"-f",
	"mp3",
	"pipe:1",
]

// Gemini's speech audio: 24 kHz, 16-bit, mono, which is 48,000 bytes a second after a WAV file's 44-byte header
const SPEECH_SAMPLE_RATE = 24_000
export const SPEECH_BYTES_PER_SECOND = SPEECH_SAMPLE_RATE * 2
export const WAV_HEADER_BYTES = 44

// the prebuilt Gemini voices of a podcast episode's host, Carl, and its co-host, Vienna.
// PODCAST_HOST_VOICE and PODCAST_COHOST_VOICE name other voices
const DEFAULT_PODCAST_HOST_VOICE = "Alnilam"
const DEFAULT_PODCAST_COHOST_VOICE = "Laomedeia"

// what Gemini's generateContent response includes for a speech call
type SpeechResponseBody = {
	candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]
	usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

/**
 * Records the turns as one two-speaker speech call, and returns the WAV and its token counts or why the call failed.
 */
export async function recordSpeech({ turns, speechTier, litellmApiKey }: RecordSpeechOptions): Promise<SpeechResult> {
	return postSpeechRequest({
		requestBody: toSpeechRequestBody(turns, speechTier),
		timeoutMs: SPEECH_TIMEOUT_MS[speechTier],
		litellmApiKey,
	})
}

/**
 * Records the text as one single-speaker speech call in the answering host's voice on the standard tier, and returns
 * the MP3, or the WAV if the encode fails, with its token counts or why the call failed.
 */
export async function recordSpokenAnswer({
	text,
	speaker = "host",
	litellmApiKey,
}: RecordSpokenAnswerOptions): Promise<SpokenAnswerResult> {
	// record the WAV, and return a failed call as it is
	const postSpeechRequestResult = await postSpeechRequest({
		requestBody: toSpokenAnswerRequestBody(text, speaker),
		timeoutMs: SPOKEN_ANSWER_TIMEOUT_MS,
		litellmApiKey,
	})
	if (postSpeechRequestResult.outcome !== "recorded") {
		return postSpeechRequestResult
	}

	// encode the WAV to an MP3, a fraction of the WAV's size
	try {
		const mp3Bytes = await runFfmpeg({
			ffmpegArguments: SPOKEN_ANSWER_MP3_ARGUMENTS,
			inputBytes: postSpeechRequestResult.audioBytes,
			timeoutMs: SPOKEN_ANSWER_ENCODE_TIMEOUT_MS,
		})
		return { ...postSpeechRequestResult, audioBytes: mp3Bytes, audioContentType: "audio/mpeg" }
	} catch (error) {
		// log and report a failed encode, and return the WAV so the paid call is never lost
		const reason = error instanceof Error ? error.message : String(error)
		console.error("spoken answer mp3 encode failed:", reason)
		reportError(new Error("spoken answer mp3 encode failed"), "chat", { reason: reason.slice(0, 500) })
		return { ...postSpeechRequestResult, audioContentType: "audio/wav" }
	}
}

/**
 * Returns one speech call's request body, with one part per turn, both voices, audio output, and the flex tier on flex.
 */
export function toSpeechRequestBody(turns: PodcastEpisodeTurn[], speechTier: SpeechTier): Record<string, unknown> {
	// each turn is its own part, labeled with its speaker and its style
	const turnParts = turns.map((turn) => ({
		text: turn.text,
		speech_metadata: turn.style ? { speaker: turn.speaker, style: turn.style } : { speaker: turn.speaker },
	}))

	// both speakers' voices, matched to the parts by speaker
	const speakerVoiceConfigs = podcastEpisodeSpeakers.map((speaker) => ({
		speaker,
		voiceConfig: { prebuiltVoiceConfig: { voiceName: toSpeakerVoice(speaker) } },
	}))
	return {
		contents: [{ role: "user", parts: turnParts }],
		generationConfig: {
			responseModalities: ["AUDIO"],
			speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs } },
		},
		// the standard tier is the default, so only flex is named
		...(speechTier === "flex" ? { service_tier: "flex" } : {}),
	}
}

/**
 * Returns a spoken answer's request body, with the text as one part, the answering host's voice alone, and audio
 * output.
 */
export function toSpokenAnswerRequestBody(text: string, speaker: PodcastEpisodeSpeaker): Record<string, unknown> {
	return {
		contents: [{ role: "user", parts: [{ text }] }],
		generationConfig: {
			responseModalities: ["AUDIO"],
			speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: toSpeakerVoice(speaker) } } },
		},
	}
}

/**
 * Returns the largest cost of speaking a spoken part of the given length on the spoken answer's tier: its text tokens,
 * and the audio tokens of the part read at the slowest pace.
 */
export function maxSpokenAnswerDollars(textLength: number): number {
	return speechCost({
		speechTier: SPOKEN_ANSWER_SPEECH_TIER,
		inputTokens: toEstimatedTokens(textLength),
		audioTokens: Math.ceil((textLength / SLOWEST_SPOKEN_CHARS_PER_SECOND) * SPEECH_AUDIO_TOKENS_PER_SECOND),
	})
}

/**
 * Sorts a failed model call into a spent key budget, a failure that another attempt can fix, or a rejection.
 */
export function toModelCallFailure(httpStatus: number, errorBody: string): ModelCallFailure {
	// LiteLLM names a spent key budget in the body, on a 429 or a 400
	const reason = errorBody.slice(0, 500)
	if (errorBody.includes("budget_exceeded") || errorBody.includes("Budget has been exceeded")) {
		return { outcome: "budget-spent", reason }
	}

	// a rate limit and an overloaded or failing server are worth another attempt
	if (isRetryableHttpStatus(httpStatus)) {
		return { outcome: "retryable", httpStatus, reason }
	}
	return { outcome: "rejected", httpStatus, reason }
}

/**
 * Sorts a thrown fetch error, a timeout or a network failure, into a failure that another attempt can fix.
 */
export function toRetryableModelCallFailure(error: unknown): ModelCallFailure {
	return { outcome: "retryable", httpStatus: null, reason: error instanceof Error ? error.message : String(error) }
}

/**
 * Returns the audio as a WAV file, adding a WAV header to raw 24 kHz samples.
 */
export function toWavBytes(audioBytes: Uint8Array): Uint8Array {
	// audio that already starts with a WAV header is returned as it is
	const isWav = new TextDecoder().decode(audioBytes.subarray(0, 4)) === "RIFF"
	if (isWav) {
		return audioBytes
	}

	// the 44-byte header for 24 kHz, 16-bit, mono samples, and a writer for its four-letter tags
	const wavHeader = new DataView(new ArrayBuffer(WAV_HEADER_BYTES))
	const writeTag = (offset: number, tag: string): void => {
		for (let i = 0; i < tag.length; i++) {
			wavHeader.setUint8(offset + i, tag.charCodeAt(i))
		}
	}

	// the file tag and size, then the format chunk's tag and size
	writeTag(0, "RIFF")
	wavHeader.setUint32(4, 36 + audioBytes.length, true)
	writeTag(8, "WAVEfmt ")
	wavHeader.setUint32(16, 16, true)

	// the format: PCM, one channel, the sample rate, the byte rate, the block size, and 16 bits a sample
	wavHeader.setUint16(20, 1, true)
	wavHeader.setUint16(22, 1, true)
	wavHeader.setUint32(24, SPEECH_SAMPLE_RATE, true)
	wavHeader.setUint32(28, SPEECH_BYTES_PER_SECOND, true)
	wavHeader.setUint16(32, 2, true)
	wavHeader.setUint16(34, 16, true)

	// the data chunk's tag and size
	writeTag(36, "data")
	wavHeader.setUint32(40, audioBytes.length, true)

	// the header, then the samples
	const wavBytes = new Uint8Array(WAV_HEADER_BYTES + audioBytes.length)
	wavBytes.set(new Uint8Array(wavHeader.buffer), 0)
	wavBytes.set(audioBytes, WAV_HEADER_BYTES)
	return wavBytes
}

// one speech request. its body, how long it may take, and the virtual key that it bills,
// or the master key if no key is given
type PostSpeechRequestOptions = { requestBody: Record<string, unknown>; timeoutMs: number; litellmApiKey?: string }

// post one speech request to the pass-through route on the key, and return the WAV with its token counts
// or why the call failed
async function postSpeechRequest({
	requestBody,
	timeoutMs,
	litellmApiKey,
}: PostSpeechRequestOptions): Promise<SpeechResult> {
	// reject the call if the speech model, the proxy, or a key is not configured
	const speechModel = podcastEpisodeSpeechModel()
	const baseUrl = Bun.env.LITELLM_BASE_URL
	const apiKey = litellmApiKey ?? Bun.env.LITELLM_MASTER_KEY
	if (!speechModel || !baseUrl || !apiKey) {
		return { outcome: "rejected", httpStatus: null, reason: "the speech model or the LiteLLM proxy is not configured" }
	}

	// post the call to the pass-through route, which forwards the body to Gemini and charges the key
	try {
		const response = await fetch(`${baseUrl}/gemini/v1beta/models/${speechModel}:generateContent`, {
			method: "POST",
			headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
			signal: AbortSignal.timeout(timeoutMs),
		})
		if (!response.ok) {
			return toModelCallFailure(response.status, await response.text())
		}

		// read the audio part. a response with no audio is worth another attempt
		const speechResponseBody = (await response.json()) as SpeechResponseBody
		const audioPart = speechResponseBody.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)
		if (!audioPart?.inlineData?.data) {
			return { outcome: "retryable", httpStatus: response.status, reason: "the speech response had no audio" }
		}

		return {
			outcome: "recorded",
			audioBytes: toWavBytes(Buffer.from(audioPart.inlineData.data, "base64")),
			inputTokens: speechResponseBody.usageMetadata?.promptTokenCount ?? 0,
			audioTokens: speechResponseBody.usageMetadata?.candidatesTokenCount ?? 0,
		}
	} catch (error) {
		// a timeout or a network failure is worth another attempt
		return toRetryableModelCallFailure(error)
	}
}

// the prebuilt voice of the host, Carl, or of the co-host, Vienna
function toSpeakerVoice(speaker: PodcastEpisodeSpeaker): string {
	return speaker === "host"
		? Bun.env.PODCAST_HOST_VOICE?.trim() || DEFAULT_PODCAST_HOST_VOICE
		: Bun.env.PODCAST_COHOST_VOICE?.trim() || DEFAULT_PODCAST_COHOST_VOICE
}

// two-speaker speech from Gemini through LiteLLM's pass-through route, billed to the virtual key that sends the call
import type { PodcastEpisodeTurn } from "@shared/contracts"
import { podcastEpisodeSpeechModel } from "@shared/podcastEpisodes"
import type { SpeechTier } from "./budget"

// one speech call. its turns, its tier, and the virtual key that it bills, or the master key if no key is given
export type RenderSpeechOptions = { turns: PodcastEpisodeTurn[]; speechTier: SpeechTier; litellmApiKey?: string }

// the result of one speech call
export type SpeechResult =
	// the audio as a WAV file, with the token counts that price it
	| { outcome: "rendered"; audioBytes: Uint8Array; inputTokens: number; audioTokens: number }
	// a failure that a retry can fix. a rate limit, a 5xx, a response with no audio, a timeout, or a network failure
	| { outcome: "retryable"; httpStatus: number | null; reason: string }
	// the key's budget is spent, and no retry this month can fix a spent budget
	| { outcome: "budget-spent"; reason: string }
	// any other rejection
	| { outcome: "rejected"; httpStatus: number | null; reason: string }

// how long one call may take. Google recommends ten minutes or more for flex, which waits for capacity
const SPEECH_TIMEOUT_MS: Record<SpeechTier, number> = { standard: 3 * 60 * 1000, flex: 12 * 60 * 1000 }

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
 * Renders the turns as one two-speaker speech call, and returns the WAV and its token counts or why the call failed.
 */
export async function renderSpeech({ turns, speechTier, litellmApiKey }: RenderSpeechOptions): Promise<SpeechResult> {
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
			body: JSON.stringify(toSpeechRequestBody(turns, speechTier)),
			signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS[speechTier]),
		})
		if (!response.ok) {
			return toFailedSpeechResult(response.status, await response.text())
		}

		// read the audio part. a response with no audio is worth another attempt
		const speechResponseBody = (await response.json()) as SpeechResponseBody
		const audioPart = speechResponseBody.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)
		if (!audioPart?.inlineData?.data) {
			return { outcome: "retryable", httpStatus: response.status, reason: "the speech response had no audio" }
		}

		return {
			outcome: "rendered",
			audioBytes: toWavBytes(Buffer.from(audioPart.inlineData.data, "base64")),
			inputTokens: speechResponseBody.usageMetadata?.promptTokenCount ?? 0,
			audioTokens: speechResponseBody.usageMetadata?.candidatesTokenCount ?? 0,
		}
	} catch (error) {
		// a timeout or a network failure is worth another attempt
		return { outcome: "retryable", httpStatus: null, reason: error instanceof Error ? error.message : String(error) }
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
	const hostVoice = Bun.env.PODCAST_HOST_VOICE?.trim() || DEFAULT_PODCAST_HOST_VOICE
	const cohostVoice = Bun.env.PODCAST_COHOST_VOICE?.trim() || DEFAULT_PODCAST_COHOST_VOICE
	const speakerVoiceConfigs = [
		{ speaker: "host", voiceConfig: { prebuiltVoiceConfig: { voiceName: hostVoice } } },
		{ speaker: "cohost", voiceConfig: { prebuiltVoiceConfig: { voiceName: cohostVoice } } },
	]
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
 * Sorts a failed speech call into a spent key budget, a failure that another attempt can fix, or a rejection.
 */
export function toFailedSpeechResult(httpStatus: number, errorBody: string): SpeechResult {
	// LiteLLM names a spent key budget in the body, on a 429 or a 400
	const reason = errorBody.slice(0, 500)
	if (errorBody.includes("budget_exceeded") || errorBody.includes("Budget has been exceeded")) {
		return { outcome: "budget-spent", reason }
	}

	// a rate limit and an overloaded or failing server are worth another attempt
	if (httpStatus === 429 || httpStatus >= 500) {
		return { outcome: "retryable", httpStatus, reason }
	}
	return { outcome: "rejected", httpStatus, reason }
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

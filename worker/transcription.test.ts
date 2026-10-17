// transcription tests: the transcode's arguments, its WAV, where it stops, and the containers it rejects, the
// transcription call's body and key, the token counts read from the usage or estimated without one, a silent WAV, how a
// failed call is sorted, and an empty model
import { afterEach, expect, test } from "bun:test"
import { VOICE_RECORDING_MAX_SECONDS } from "@shared/payloads"
import { saveEnvSettings } from "@shared/savedEnvSettings"
import { runFfmpeg } from "./ffmpeg"
import { toWavBytes, WAV_HEADER_BYTES } from "./speech"
import { TRANSCODE_ARGUMENTS, type TranscriptionResult, transcodeRecording, transcribeRecording } from "./transcription"

// the real fetch and env to put back after each test
const realFetch = globalThis.fetch
const restoreEnvSettings = saveEnvSettings(["CHAT_TRANSCRIPTION_MODEL", "LITELLM_BASE_URL"])

// put fetch and the env back, removing a value that was unset
afterEach(() => {
	globalThis.fetch = realFetch
	restoreEnvSettings()
})

// two seconds of 16 kHz mono silence as the WAV that a transcode writes
const TWO_SECOND_WAV = new Uint8Array(WAV_HEADER_BYTES + 2 * 32_000)

// one request that a stubbed fetch recorded. its url, the key header, and the parsed body
type SentTranscriptionRequest = { url: string; apiKey: string | undefined; requestBody: unknown }

// stub fetch with one that records each call into the list and returns the response
function stubTranscriptionFetch(sentRequests: SentTranscriptionRequest[], response: Response): void {
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		const requestHeaders = (init?.headers ?? {}) as Record<string, string>
		sentRequests.push({
			url: String(url),
			apiKey: requestHeaders["x-goog-api-key"],
			requestBody: JSON.parse(String(init?.body)),
		})
		return response
	}) as typeof fetch
}

// a completed interaction with the transcript as one text item and the usage that prices it
function toInteractionResponse(transcript: string, usage?: Record<string, unknown>): Response {
	return Response.json({
		status: "completed",
		steps: [{ type: "model_output", content: [{ type: "text", text: transcript }] }],
		...(usage ? { usage } : {}),
	})
}

// the default transcription model and a test proxy url
function configureTranscription(): void {
	delete Bun.env.CHAT_TRANSCRIPTION_MODEL
	Bun.env.LITELLM_BASE_URL = "http://proxy.test"
}

// a recording as Safari writes it: 16 kHz mono silence for the seconds, as aac in a fragmented mp4
async function toSafariRecording(seconds: number): Promise<Uint8Array> {
	return runFfmpeg({
		ffmpegArguments: [
			...["-f", "s16le", "-ar", "16000", "-ac", "1", "-i", "pipe:0"],
			...["-c:a", "aac", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "pipe:1"],
		],
		inputBytes: new Uint8Array(seconds * 32_000),
	})
}

// the whitelists come before the input, and the large output writes and the limit come before the WAV output
test("transcodeRecording reads only whitelisted input and writes WAV in large chunks", () => {
	expect(TRANSCODE_ARGUMENTS).toEqual([
		...["-protocol_whitelist", "pipe"],
		...["-format_whitelist", "matroska,webm,mov,mp4,m4a,ogg"],
		...["-codec_whitelist", "opus,aac,vorbis"],
		...["-i", "pipe:0", "-ac", "1", "-ar", "16000", "-t", String(VOICE_RECORDING_MAX_SECONDS + 1)],
		...["-fflags", "+bitexact", "-flush_packets", "0", "-f", "wav", "pipe:1"],
	])
})

// the transcode needs ffmpeg, which the runtime image has and a developer's machine may not
test.skipIf(!Bun.which("ffmpeg"))("transcodeRecording writes 16 kHz mono 16-bit WAV", async () => {
	// a tenth of a second of Safari's recording
	const transcodedWav = await transcodeRecording(await toSafariRecording(0.1))

	// the WAV header names one channel at 16 kHz with 16 bits a sample
	const wavHeader = new DataView(transcodedWav.buffer, transcodedWav.byteOffset)
	expect(new TextDecoder().decode(transcodedWav.subarray(0, 4))).toBe("RIFF")
	expect([wavHeader.getUint16(22, true), wavHeader.getUint32(24, true), wavHeader.getUint16(34, true)]).toEqual([
		1, 16_000, 16,
	])
})

// a recording that decodes past the longest recording is cut there, so a small recording that decodes to minutes of
// WAV never fills the api's memory
test.skipIf(!Bun.which("ffmpeg"))("transcodeRecording stops one second past the recording limit", async () => {
	// three minutes of Safari's recording
	const transcodedWav = await transcodeRecording(await toSafariRecording(180))

	// the WAV is one second past the limit at 32,000 bytes a second after the header, and bitexact leaves out ffmpeg's
	// metadata chunk, so the data chunk follows the format chunk at once
	const longestWavBytes = WAV_HEADER_BYTES + (VOICE_RECORDING_MAX_SECONDS + 1) * 32_000
	expect(transcodedWav.length).toBeGreaterThanOrEqual(longestWavBytes)
	expect(transcodedWav.length).toBeLessThanOrEqual(longestWavBytes + 64)
	expect(new TextDecoder().decode(transcodedWav.subarray(36, 40))).toBe("data")
})

// a container that no browser records in is rejected before ffmpeg decodes it
test.skipIf(!Bun.which("ffmpeg"))("transcodeRecording rejects a container outside the whitelist", async () => {
	await expect(transcodeRecording(toWavBytes(new Uint8Array(4800)))).rejects.toThrow(/not on whitelist/)
})

test("a call posts the WAV inline with store off on the key and reads the transcript with its usage", async () => {
	// a response with the transcript and the usage that the Interactions API returns
	configureTranscription()
	const sentRequests: SentTranscriptionRequest[] = []
	const usage = {
		total_tokens: 79,
		total_input_tokens: 70,
		total_output_tokens: 9,
		total_thought_tokens: 0,
		input_tokens_by_modality: [
			{ modality: "text", tokens: 6 },
			{ modality: "audio", tokens: 64 },
		],
	}
	stubTranscriptionFetch(sentRequests, toInteractionResponse(" Three reviews came out this week. ", usage))

	// the result is the trimmed transcript, with the audio and text tokens as its input
	const transcribeRecordingResult = await transcribeRecording({ audioBytes: TWO_SECOND_WAV, litellmApiKey: "sk-user" })
	expect(transcribeRecordingResult).toEqual({
		outcome: "transcribed",
		transcript: "Three reviews came out this week.",
		inputTokens: 70,
		outputTokens: 9,
	})

	// the call went to the Interactions API on the user's key, with the model, the WAV, and store off
	expect(sentRequests).toEqual([
		{
			url: "http://proxy.test/gemini/v1beta/interactions",
			apiKey: "sk-user",
			requestBody: {
				model: "gemini-3.5-transcribe",
				input: [{ type: "audio", data: Buffer.from(TWO_SECOND_WAV).toString("base64"), mime_type: "audio/wav" }],
				store: false,
			},
		},
	])
})

test("a usage with only the modalities prices the call by their sum, and thought tokens count as output", async () => {
	configureTranscription()
	const usage = {
		total_output_tokens: 2,
		total_thought_tokens: 3,
		input_tokens_by_modality: [
			{ modality: "text", tokens: 1 },
			{ modality: "audio", tokens: 64 },
		],
	}
	stubTranscriptionFetch([], toInteractionResponse("Hello", usage))
	const transcribeRecordingResult = await transcribeRecording({ audioBytes: TWO_SECOND_WAV, litellmApiKey: "sk-user" })
	expect(transcribeRecordingResult).toMatchObject({ outcome: "transcribed", inputTokens: 65, outputTokens: 5 })
})

test("a response with no usage estimates the tokens from the audio's seconds and the transcript", async () => {
	// two seconds of audio at 32 tokens a second, and an 18 character transcript at four characters a token
	configureTranscription()
	stubTranscriptionFetch([], toInteractionResponse("Hello there, Carl."))
	const transcribeRecordingResult = await transcribeRecording({ audioBytes: TWO_SECOND_WAV, litellmApiKey: "sk-user" })
	expect(transcribeRecordingResult).toEqual({
		outcome: "transcribed",
		transcript: "Hello there, Carl.",
		inputTokens: 64,
		outputTokens: 5,
	})
})

// a WAV of only its header makes no call
test("a WAV with no samples is silent without a call", async () => {
	configureTranscription()
	const sentRequests: SentTranscriptionRequest[] = []
	stubTranscriptionFetch(sentRequests, toInteractionResponse("never sent"))
	const transcribeRecordingResult = await transcribeRecording({
		audioBytes: new Uint8Array(WAV_HEADER_BYTES),
		litellmApiKey: "sk-user",
	})
	expect(transcribeRecordingResult).toEqual({ outcome: "silent" })
	expect(sentRequests).toEqual([])
})

test("an interaction that did not complete is retryable", async () => {
	configureTranscription()
	stubTranscriptionFetch([], Response.json({ status: "failed", steps: [] }))
	const transcribeRecordingResult = await transcribeRecording({ audioBytes: TWO_SECOND_WAV, litellmApiKey: "sk-user" })
	expect(transcribeRecordingResult.outcome).toBe("retryable")
})

// a spent key budget does not retry, a 503 does, and a plain 400 is final
test("a failed call is sorted into budget-spent, retryable, or rejected", async () => {
	configureTranscription()
	const failedResponses: [Response, TranscriptionResult["outcome"]][] = [
		[new Response('{"error":{"type":"budget_exceeded"}}', { status: 429 }), "budget-spent"],
		[new Response("overloaded", { status: 503 }), "retryable"],
		[new Response("unsupported file", { status: 400 }), "rejected"],
	]
	for (const [failedResponse, outcome] of failedResponses) {
		stubTranscriptionFetch([], failedResponse)
		const transcribeRecordingResult = await transcribeRecording({
			audioBytes: TWO_SECOND_WAV,
			litellmApiKey: "sk-user",
		})
		expect(transcribeRecordingResult.outcome).toBe(outcome)
	}
})

// with the transcription model set empty, the call is rejected without reaching the proxy
test("a call with the transcription model set empty is rejected", async () => {
	Bun.env.CHAT_TRANSCRIPTION_MODEL = ""
	Bun.env.LITELLM_BASE_URL = "http://proxy.test"
	const transcribeRecordingResult = await transcribeRecording({ audioBytes: TWO_SECOND_WAV, litellmApiKey: "sk-user" })
	expect(transcribeRecordingResult.outcome).toBe("rejected")
})

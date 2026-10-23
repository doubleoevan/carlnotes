// a chat recording's transcription. ffmpeg transcodes the browser's recording to WAV through its pipes, and Gemini
// transcribes the WAV through the Interactions API on LiteLLM's Gemini pass-through on the user's key, with store set to
// false so Google keeps no recording
import { VOICE_RECORDING_MAX_SECONDS } from "@carlnotes/contracts/payloads"
import { chatTranscriptionModel } from "@carlnotes/server/voiceChat"
import { toEstimatedTokens, transcriptionCost } from "./budget"
import { runFfmpeg } from "./ffmpeg"
import { type ModelCallFailure, toModelCallFailure, toRetryableModelCallFailure, WAV_HEADER_BYTES } from "./speech"

// one transcription call. the WAV to transcribe and the virtual key that it bills
export type TranscribeRecordingOptions = { audioBytes: Uint8Array; litellmApiKey: string }

// the result of one transcription call. the transcript, with the token counts that price it, a WAV with no samples,
// which makes no call, or how the call failed
export type TranscriptionResult =
	| { outcome: "transcribed"; transcript: string; inputTokens: number; outputTokens: number }
	| { outcome: "silent" }
	| ModelCallFailure

// how long one call may take
const TRANSCRIPTION_TIMEOUT_MS = 60 * 1000

// the transcode's WAV: 16 kHz, 16-bit, mono, which is 32,000 bytes a second after the header
const TRANSCRIPTION_SAMPLE_RATE = 16_000
const TRANSCRIPTION_BYTES_PER_SECOND = TRANSCRIPTION_SAMPLE_RATE * 2

// the most seconds the transcode writes: the browser's recording limit plus the recorder's last chunk. the body
// limit bounds only the recording, and a tiny recording of silence decodes to as much WAV as its length says
const TRANSCRIPTION_MAX_SECONDS = VOICE_RECORDING_MAX_SECONDS + 1

// how long the transcode may run before it is killed
const TRANSCODE_TIMEOUT_MS = 10 * 1000

// the demuxers and decoders the transcode accepts: the containers and codecs that a browser's MediaRecorder writes.
// Chrome and Firefox write opus in webm, Firefox may write opus in ogg, and Safari writes aac in fragmented mp4
const TRANSCODE_FORMAT_WHITELIST = "matroska,webm,mov,mp4,m4a,ogg"
const TRANSCODE_CODEC_WHITELIST = "opus,aac,vorbis"

// the transcode's arguments. the recording on ffmpeg's input pipe, read only through the whitelists, and the WAV on its
// output pipe, cut at the longest recording. the output's packets go out as a few large writes instead of one pipe
// write each. bitexact leaves out ffmpeg's 34-byte metadata chunk, so a WAV holding no samples is exactly
// WAV_HEADER_BYTES long
export const TRANSCODE_ARGUMENTS = [
	"-protocol_whitelist",
	"pipe",
	"-format_whitelist",
	TRANSCODE_FORMAT_WHITELIST,
	"-codec_whitelist",
	TRANSCODE_CODEC_WHITELIST,
	"-i",
	"pipe:0",
	"-ac",
	"1",
	"-ar",
	String(TRANSCRIPTION_SAMPLE_RATE),
	"-t",
	String(TRANSCRIPTION_MAX_SECONDS),
	"-fflags",
	"+bitexact",
	"-flush_packets",
	"0",
	"-f",
	"wav",
	"pipe:1",
]

// Gemini's audio tokens a second, for a response that gives no usage
const AUDIO_TOKENS_PER_SECOND = 32

// the most output one transcription is priced at in tokens: a minute's transcript with room for the thought tokens,
// which Google prices as output. the request sets no output limit, so this is the estimate's allowance
const MAX_TRANSCRIPTION_OUTPUT_TOKENS = 4000

// the largest cost of one transcription: the longest recording's audio tokens and the output allowance
export const MAX_TRANSCRIPTION_DOLLARS = transcriptionCost({
	inputTokens: TRANSCRIPTION_MAX_SECONDS * AUDIO_TOKENS_PER_SECOND,
	outputTokens: MAX_TRANSCRIPTION_OUTPUT_TOKENS,
})

// what the Interactions API's response includes. its status, the steps whose text items hold the transcript, and the
// usage
type InteractionResponseBody = {
	status?: string
	steps?: { content?: { type?: string; text?: string }[] }[]
	usage?: InteractionUsage
}

// an interaction's token counts. the input in total and by modality, the output, and the thought tokens
type InteractionUsage = {
	total_input_tokens?: number
	total_output_tokens?: number
	total_thought_tokens?: number
	input_tokens_by_modality?: { modality?: string; tokens?: number }[]
}

/**
 * Transcodes a browser's recording to 16 kHz mono 16-bit WAV through ffmpeg's pipes, stopping at the most seconds
 * a recording may hold.
 */
export async function transcodeRecording(recordingBytes: Uint8Array): Promise<Uint8Array> {
	return runFfmpeg({
		ffmpegArguments: TRANSCODE_ARGUMENTS,
		inputBytes: recordingBytes,
		timeoutMs: TRANSCODE_TIMEOUT_MS,
	})
}

/**
 * Transcribes a WAV through the Interactions API on the key, and returns the transcript with its token counts, a silent
 * result for a WAV with no samples, or why the call failed.
 */
export async function transcribeRecording({
	audioBytes,
	litellmApiKey,
}: TranscribeRecordingOptions): Promise<TranscriptionResult> {
	// reject the call if the transcription model, the proxy, or the key is not configured
	const transcriptionModel = chatTranscriptionModel()
	const baseUrl = Bun.env.LITELLM_BASE_URL
	if (!transcriptionModel || !baseUrl || !litellmApiKey) {
		return {
			outcome: "rejected",
			httpStatus: null,
			reason: "the transcription model or the LiteLLM proxy is not configured",
		}
	}

	// a WAV with no samples has nothing to transcribe
	if (audioBytes.length <= WAV_HEADER_BYTES) {
		return { outcome: "silent" }
	}

	// post the WAV inline to the Interactions API, with store set to false so Google keeps no recording
	try {
		const response = await fetch(`${baseUrl}/gemini/v1beta/interactions`, {
			method: "POST",
			headers: { "x-goog-api-key": litellmApiKey, "Content-Type": "application/json" },
			body: JSON.stringify({
				model: transcriptionModel,
				input: [{ type: "audio", data: Buffer.from(audioBytes).toString("base64"), mime_type: "audio/wav" }],
				store: false,
			}),
			signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
		})
		if (!response.ok) {
			return toModelCallFailure(response.status, await response.text())
		}

		// an interaction that did not complete is worth another attempt
		const interactionResponseBody = (await response.json()) as InteractionResponseBody
		if (interactionResponseBody.status !== "completed") {
			return {
				outcome: "retryable",
				httpStatus: response.status,
				reason: `the transcription did not complete: ${interactionResponseBody.status ?? "no status"}`,
			}
		}

		// read the transcript from the steps' text items, and the token counts that price it
		const transcript = (interactionResponseBody.steps ?? [])
			.flatMap((step) => step.content ?? [])
			.filter((content) => content.type === "text" && content.text)
			.map((content) => content.text)
			.join(" ")
			.trim()
		const { inputTokens, outputTokens } = toTranscriptionTokens({
			usage: interactionResponseBody.usage,
			audioBytes,
			transcript,
		})
		return { outcome: "transcribed", transcript, inputTokens, outputTokens }
	} catch (error) {
		// a timeout or a network failure is worth another attempt
		return toRetryableModelCallFailure(error)
	}
}

// the token counts of one call. the response's usage if it gave one, the WAV that was sent, and the transcript
type ToTranscriptionTokensOptions = {
	usage: InteractionUsage | undefined
	audioBytes: Uint8Array
	transcript: string
}

// read the token counts from the response's usage, or estimate them from the audio's length and the transcript
function toTranscriptionTokens({ usage, audioBytes, transcript }: ToTranscriptionTokensOptions): {
	inputTokens: number
	outputTokens: number
} {
	// read the usage's counts. the input is the audio tokens plus the text tokens, which the total input counts or the
	// modalities add up to, and the output includes any thought tokens, which Google prices as output
	if (usage) {
		const modalityTokens = (usage.input_tokens_by_modality ?? []).reduce((sum, { tokens }) => sum + (tokens ?? 0), 0)
		const inputTokens = usage.total_input_tokens ?? modalityTokens
		const outputTokens = (usage.total_output_tokens ?? 0) + (usage.total_thought_tokens ?? 0)
		return { inputTokens, outputTokens }
	}

	// estimate the counts with no usage. Gemini tokenizes audio at about 32 tokens a second,
	// and a transcript token is about four characters
	const audioSeconds = Math.max(0, audioBytes.length - WAV_HEADER_BYTES) / TRANSCRIPTION_BYTES_PER_SECOND
	return {
		inputTokens: Math.round(audioSeconds * AUDIO_TOKENS_PER_SECOND),
		outputTokens: toEstimatedTokens(transcript.length),
	}
}

// the voice chat gate: the transcription model, and whether voice is on beside the podcast speech model
import { podcastEpisodeSpeechModel } from "./podcastEpisodeSettings"

// Google's model that transcribes a recording through LiteLLM's Gemini pass-through.
// CHAT_TRANSCRIPTION_MODEL names another model, and an empty value turns voice off
const DEFAULT_CHAT_TRANSCRIPTION_MODEL = "gemini-3.5-transcribe"

/**
 * Returns Google's model that transcribes a recording, or null if CHAT_TRANSCRIPTION_MODEL is set empty.
 */
export function chatTranscriptionModel(): string | null {
	return (Bun.env.CHAT_TRANSCRIPTION_MODEL ?? DEFAULT_CHAT_TRANSCRIPTION_MODEL).trim() || null
}

/**
 * Whether a transcription model and a speech model are both set, which voice chat requires.
 */
export function isVoiceChatConfigured(): boolean {
	return chatTranscriptionModel() !== null && podcastEpisodeSpeechModel() !== null
}

// the podcast episode settings that read the environment: the speech model that records episodes

// the Gemini speech model that records episodes.
// PODCAST_SPEECH_MODEL names another model, and an empty value turns podcast episodes off
const DEFAULT_PODCAST_SPEECH_MODEL = "gemini-3.8-flash-tts"

/**
 * Returns the Gemini speech model that records episodes, or null if PODCAST_SPEECH_MODEL is set empty.
 */
export function podcastEpisodeSpeechModel(): string | null {
	return (Bun.env.PODCAST_SPEECH_MODEL ?? DEFAULT_PODCAST_SPEECH_MODEL).trim() || null
}

/**
 * Whether a speech model is set, which podcast episode recording requires.
 */
export function isPodcastEpisodeRecordingConfigured(): boolean {
	return podcastEpisodeSpeechModel() !== null
}

// the podcast episode settings that read the environment: the speech model that records podcast episodes, how many
// films render at once, whether the film backfill runs, how many generated images a film draws by default, and
// whether an MCP view plays a film

import { toWholeNumber } from "./envSettings"

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

// one film renders at a time on a worker replica by default, so long renders never take slots from recordings
const DEFAULT_TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY = 1
const DEFAULT_TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY = 1

/**
 * Returns how many films render at once on a worker replica, from TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY. Zero turns
 * films off: no worker polls the film queue, and no recording or backfill starts a film.
 */
export function topicPodcastEpisodeVideoConcurrency(): number {
	return toWholeNumber(Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY, DEFAULT_TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY)
}

/**
 * Returns how many films the backfill renders at once, from TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY. Zero
 * turns the backfill off.
 */
export function topicPodcastEpisodeVideoBackfillConcurrency(): number {
	return toWholeNumber(
		Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY,
		DEFAULT_TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY,
	)
}

/**
 * Whether the film backfill runs: films are on, and the backfill concurrency is above zero.
 */
export function isTopicPodcastEpisodeVideoBackfillEnabled(): boolean {
	return topicPodcastEpisodeVideoConcurrency() > 0 && topicPodcastEpisodeVideoBackfillConcurrency() > 0
}

// how many generated images one film draws at most by default, across all its chapters
const DEFAULT_GENERATED_CHAPTER_IMAGE_LIMIT = 40

/**
 * Returns how many generated images one film draws at most by default, from
 * TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT. Zero turns generated images off.
 */
export function generatedChapterImageLimit(): number {
	return toWholeNumber(
		Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT,
		DEFAULT_GENERATED_CHAPTER_IMAGE_LIMIT,
	)
}

/**
 * Returns whether an MCP view plays a podcast episode's film in its frame, from MCP_VIEW_FILM_PLAYBACK.
 */
export function isMcpViewFilmPlaybackEnabled(): boolean {
	return Bun.env.MCP_VIEW_FILM_PLAYBACK === "true"
}

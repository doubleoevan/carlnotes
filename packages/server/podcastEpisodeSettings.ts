// the podcast episode settings that read the environment: the speech model that records episodes, how many films
// render at once, and which chapters of a film get an imagined image

import { toPositiveInteger, toWholeNumber } from "./envSettings"

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
 * Returns how many films the backfill renders at once, from TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY.
 */
export function topicPodcastEpisodeVideoBackfillConcurrency(): number {
	return toPositiveInteger(
		Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY,
		DEFAULT_TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY,
	)
}

// a chapter with no link preview image gets an imagined image if it runs this many seconds or longer, and a film gets
// at most this many imagined images
const DEFAULT_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS = 90
const DEFAULT_IMAGINED_CHAPTER_IMAGE_LIMIT = 4

/**
 * Returns how many seconds a film's chapter runs before it may get an imagined image, from
 * TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS.
 */
export function imaginedChapterImageMinimumSeconds(): number {
	return toPositiveInteger(
		Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS,
		DEFAULT_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS,
	)
}

/**
 * Returns how many imagined images one film gets at most, from TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_LIMIT.
 * Zero turns imagined images off.
 */
export function imaginedChapterImageLimit(): number {
	return toWholeNumber(
		Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_LIMIT,
		DEFAULT_IMAGINED_CHAPTER_IMAGE_LIMIT,
	)
}

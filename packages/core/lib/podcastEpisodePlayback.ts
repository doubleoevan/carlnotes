// the shared chapter, seek, rate, and system metadata rules

import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import type { PodcastEpisode, PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import {
	FULL_PODCAST_COVER_SIZE,
	PODCAST_EPISODE_SPEAKER_NAMES,
	PODCAST_HOSTS_NAME,
	PODCAST_NAME,
	type PodcastCoverSize,
	SMALL_PODCAST_COVER_SIZE,
} from "@carlnotes/contracts/podcastEpisodes"

// the playback rates, in the order that toNextPlaybackRate steps through
export const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.75]

// how far the back and forward controls skip
export const SKIP_BACK_SECONDS = 15
export const SKIP_FORWARD_SECONDS = 30

/**
 * Returns the index of the chapter playing at a position, or -1 if the podcast episode has no chapters.
 */
export function toChapterIndexAt(chapters: PodcastEpisodeChapter[], positionSeconds: number): number {
	const chapterIndex = chapters.findLastIndex((chapter) => chapter.startSeconds <= positionSeconds)
	return chapters.length > 0 ? Math.max(chapterIndex, 0) : -1
}

/**
 * Returns the chapter at a chapter position, or undefined if the podcast episode has no chapter there.
 */
export function toChapterAtPosition(
	chapters: PodcastEpisodeChapter[],
	chapterPosition: number,
): PodcastEpisodeChapter | undefined {
	return chapters.find((chapter) => chapter.position === chapterPosition)
}

/**
 * Returns the playback rate after this one in the list, or the first playback rate after the last.
 */
export function toNextPlaybackRate(playbackRate: number): number {
	const playbackRateIndex = PLAYBACK_RATES.indexOf(playbackRate)
	return PLAYBACK_RATES[(playbackRateIndex + 1) % PLAYBACK_RATES.length] ?? 1
}

// the metadata accepted by each platform's system player
export type PodcastEpisodeMediaMetadata = {
	title: string
	artist: string
	album: string
	artwork: { src: string; sizes: string; type: string }[]
}

/**
 * Keeps a requested position within the episode's playable duration.
 */
export function toPodcastEpisodeSeekSeconds({
	positionSeconds,
	durationSeconds,
}: {
	positionSeconds: number
	durationSeconds: number | null
}): number {
	// reject invalid positions and clamp the requested time
	const finitePositionSeconds = Number.isFinite(positionSeconds) ? positionSeconds : 0
	const finiteDurationSeconds = durationSeconds !== null && Number.isFinite(durationSeconds) ? durationSeconds : 0
	return Math.min(Math.max(finitePositionSeconds, 0), Math.max(finiteDurationSeconds, 0))
}

/**
 * Names the current chapter, episode, hosts, and cover for system playback controls.
 */
export function toPodcastEpisodeMediaMetadata(
	podcastEpisode: PodcastEpisode,
	positionSeconds: number,
): PodcastEpisodeMediaMetadata {
	const playerChapter = podcastEpisode.chapters[toChapterIndexAt(podcastEpisode.chapters, positionSeconds)]
	return {
		title: playerChapter?.title ?? podcastEpisode.title ?? PODCAST_NAME,
		artist: PODCAST_HOSTS_NAME,
		album: podcastEpisode.title ?? PODCAST_NAME,
		artwork: toPodcastEpisodeArtwork(podcastEpisode),
	}
}

/**
 * Returns what the lock screen shows while a host answers a question asked from the podcast player: the host's name,
 * the podcast's name, and the podcast episode's cover.
 */
export function toPodcastEpisodeSpeakerMediaMetadata(
	podcastEpisode: PodcastEpisode,
	speaker: PodcastEpisodeSpeaker,
): PodcastEpisodeMediaMetadata {
	return {
		title: PODCAST_EPISODE_SPEAKER_NAMES[speaker],
		artist: PODCAST_NAME,
		album: podcastEpisode.title ?? PODCAST_NAME,
		artwork: toPodcastEpisodeArtwork(podcastEpisode),
	}
}

// the podcast episode's cover at each size it is served at
function toPodcastEpisodeArtwork(podcastEpisode: PodcastEpisode): PodcastEpisodeMediaMetadata["artwork"] {
	return [
		...(podcastEpisode.smallCoverUrl
			? [{ src: podcastEpisode.smallCoverUrl, sizes: toArtworkSizes(SMALL_PODCAST_COVER_SIZE), type: "image/jpeg" }]
			: []),
		...(podcastEpisode.coverUrl
			? [{ src: podcastEpisode.coverUrl, sizes: toArtworkSizes(FULL_PODCAST_COVER_SIZE), type: "image/jpeg" }]
			: []),
	]
}

// a square cover's pixel size as the media session reads it, as in 600x600
function toArtworkSizes(coverSize: PodcastCoverSize): string {
	return `${coverSize}x${coverSize}`
}

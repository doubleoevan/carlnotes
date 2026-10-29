import type { PodcastEpisode, PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodePlayActions } from "@carlnotes/core/stores/podcastEpisodePlayActions"
import * as playerStore from "./podcastEpisodePlayerStore"

// bind the shared actions to the browser player exports
const playActions = toPodcastEpisodePlayActions(playerStore)

/**
 * Toggles the current chapter or plays another from its start.
 */
export function togglePodcastEpisodeChapterPlayback(
	podcastEpisode: PodcastEpisode,
	chapter: PodcastEpisodeChapter,
): void {
	playActions.togglePodcastEpisodeChapterPlayback(podcastEpisode, chapter)
}

/**
 * Toggles a loaded episode or fetches and plays the requested one.
 */
export async function togglePodcastEpisodePlayback(podcastEpisodeId: string): Promise<void> {
	await playActions.togglePodcastEpisodePlayback(podcastEpisodeId)
}

/**
 * Plays the requested chapter, falling back to saved progress if it is missing.
 */
export async function playPodcastEpisodeChapter(podcastEpisodeId: string, chapterPosition: number): Promise<void> {
	await playActions.playPodcastEpisodeChapter(podcastEpisodeId, chapterPosition)
}

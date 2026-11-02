import { showClientError } from "@carlnotes/client/apiClient"
import { fetchPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode, PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import { PODCAST_EPISODE_LOAD_FAILED_TEXT } from "../lib/podcastEpisodeCopy"
import { toChapterAtPosition } from "../lib/podcastEpisodePlayback"
import { toPlayerChapterPosition } from "./podcastEpisodePlayerState"
import * as playerStore from "./podcastEpisodePlayerStore"

/**
 * Toggles the current chapter or plays another from its start.
 */
export function togglePodcastEpisodeChapterPlayback(
	podcastEpisode: PodcastEpisode,
	chapter: PodcastEpisodeChapter,
): void {
	// toggle the current chapter and start any other chapter
	const isPlayerChapter = toPlayerChapterPosition(podcastEpisode.id) === chapter.position
	if (isPlayerChapter) {
		playerStore.togglePlayback()
	} else {
		void playerStore.playPodcastEpisode(podcastEpisode, chapter.startSeconds)
	}
}

/**
 * Toggles a loaded episode or fetches and plays the requested one.
 */
export async function togglePodcastEpisodePlayback(podcastEpisodeId: string): Promise<void> {
	// toggle the podcast episode that is already loaded
	if (playerStore.toLoadedPodcastEpisode()?.id === podcastEpisodeId) {
		playerStore.togglePlayback()
		return
	}
	// reject a fetch superseded by a later player action
	const version = playerStore.retirePodcastEpisodeRequests()
	const podcastEpisode = await fetchPlayablePodcastEpisode(podcastEpisodeId)
	if (podcastEpisode && playerStore.isPodcastEpisodeRequestCurrent(version)) {
		await playerStore.playPodcastEpisode(podcastEpisode)
	}
}

/**
 * Plays the requested chapter, falling back to saved progress if it is missing.
 */
export async function playPodcastEpisodeChapter(podcastEpisodeId: string, chapterPosition: number): Promise<void> {
	// reuse loaded chapters and reject a retired fetch
	const version = playerStore.retirePodcastEpisodeRequests()
	const loadedPodcastEpisode = playerStore.toLoadedPodcastEpisode()
	const podcastEpisode =
		loadedPodcastEpisode?.id === podcastEpisodeId
			? loadedPodcastEpisode
			: await fetchPlayablePodcastEpisode(podcastEpisodeId)

	// stop if the fetch failed or a later player action retired it
	if (!podcastEpisode || !playerStore.isPodcastEpisodeRequestCurrent(version)) {
		return
	}

	// play from the chapter's start, or from saved progress if the chapter is missing
	const chapter = toChapterAtPosition(podcastEpisode.chapters, chapterPosition)
	await playerStore.playPodcastEpisode(podcastEpisode, chapter?.startSeconds)
}

// fetch a podcast episode to play, showing an error and returning null if it fails to load
async function fetchPlayablePodcastEpisode(podcastEpisodeId: string): Promise<PodcastEpisode | null> {
	return await fetchPodcastEpisode(podcastEpisodeId).catch(() => {
		showClientError(PODCAST_EPISODE_LOAD_FAILED_TEXT)
		return null
	})
}

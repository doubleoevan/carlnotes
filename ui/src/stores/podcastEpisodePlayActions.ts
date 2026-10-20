// the play buttons' actions on a podcast episode or one of its chapters, by id: the loaded podcast episode plays or
// pauses, and any other podcast episode is fetched and played
import type { PodcastEpisode, PodcastEpisodeChapter } from "@shared/contracts/podcast"
import { fetchPodcastEpisode } from "@/clients/podcastEpisodeClient"
import { toChapterAtPosition } from "@/lib/podcastEpisodePlayback"
import {
	playPodcastEpisode,
	togglePlayback,
	toLoadedPodcastEpisode,
	toPlayerChapterPosition,
} from "@/stores/podcastEpisodePlayerStore"

/**
 * Plays or pauses the player's chapter, and plays the podcast episode from any other chapter.
 */
export function togglePodcastEpisodeChapterPlayback(
	podcastEpisode: PodcastEpisode,
	chapter: PodcastEpisodeChapter,
): void {
	// pause or play the player's chapter, and play any other chapter from its start
	const isPlayerChapter = toPlayerChapterPosition(podcastEpisode.id) === chapter.position
	if (isPlayerChapter) {
		togglePlayback()
	} else {
		void playPodcastEpisode(podcastEpisode, chapter.startSeconds)
	}
}

/**
 * Plays or pauses the loaded podcast episode if the id matches, and fetches and plays any other podcast episode.
 */
export async function togglePodcastEpisodePlayback(podcastEpisodeId: string): Promise<void> {
	if (toLoadedPodcastEpisode()?.id === podcastEpisodeId) {
		togglePlayback()
		return
	}

	// fetch the podcast episode with its chapters, then play the podcast episode
	const fetchedPodcastEpisode = await fetchPodcastEpisode(podcastEpisodeId)
	if (fetchedPodcastEpisode) {
		await playPodcastEpisode(fetchedPodcastEpisode)
	}
}

/**
 * Plays a podcast episode from the start of one of its chapters, fetching the podcast episode unless it is loaded.
 */
export async function playPodcastEpisodeChapter(podcastEpisodeId: string, chapterPosition: number): Promise<void> {
	// the loaded podcast episode, or the fetched one with its chapters
	const loadedPodcastEpisode = toLoadedPodcastEpisode()
	const podcastEpisode =
		loadedPodcastEpisode?.id === podcastEpisodeId ? loadedPodcastEpisode : await fetchPodcastEpisode(podcastEpisodeId)
	if (!podcastEpisode) {
		return
	}

	// play from the chapter's start, or from where the user left off if the chapter is gone
	const chapter = toChapterAtPosition(podcastEpisode.chapters, chapterPosition)
	await playPodcastEpisode(podcastEpisode, chapter?.startSeconds)
}

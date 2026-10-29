import { showClientError } from "@carlnotes/client/apiClient"
import { fetchPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode, PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import { toChapterAtPosition } from "../lib/podcastEpisodePlayback"
import * as playerStore from "./podcastEpisodePlayerStore"

// the player operations used by episode controls and app-specific wrappers
type PodcastEpisodePlayActionsAdapter = Pick<
	typeof playerStore,
	"playPodcastEpisode" | "togglePlayback" | "toLoadedPodcastEpisode" | "toPlayerChapterPosition"
>
type PodcastEpisodePlayActions = {
	togglePodcastEpisodeChapterPlayback: (podcastEpisode: PodcastEpisode, chapter: PodcastEpisodeChapter) => void
	togglePodcastEpisodePlayback: (podcastEpisodeId: string) => Promise<void>
	playPodcastEpisodeChapter: (podcastEpisodeId: string, chapterPosition: number) => Promise<void>
}

/**
 * Binds episode and chapter controls to an app's player exports.
 */
export function toPodcastEpisodePlayActions(player: PodcastEpisodePlayActionsAdapter): PodcastEpisodePlayActions {
	return {
		togglePodcastEpisodeChapterPlayback: (podcastEpisode, chapter) => {
			// toggle the current chapter and start any other chapter
			const isPlayerChapter = player.toPlayerChapterPosition(podcastEpisode.id) === chapter.position
			if (isPlayerChapter) {
				player.togglePlayback()
			} else {
				void player.playPodcastEpisode(podcastEpisode, chapter.startSeconds)
			}
		},
		togglePodcastEpisodePlayback: async (podcastEpisodeId) => {
			if (player.toLoadedPodcastEpisode()?.id === podcastEpisodeId) {
				player.togglePlayback()
				return
			}
			// reject a fetch superseded by a later player action
			const version = playerStore.retirePodcastEpisodeRequests()
			const podcastEpisode = await fetchPodcastEpisode(podcastEpisodeId).catch(() => {
				showClientError("This episode could not load. Try again.")
				return null
			})
			if (podcastEpisode && playerStore.isPodcastEpisodeRequestCurrent(version)) {
				await player.playPodcastEpisode(podcastEpisode)
			}
		},
		playPodcastEpisodeChapter: async (podcastEpisodeId, chapterPosition) => {
			// reuse loaded chapters and reject a retired fetch
			const version = playerStore.retirePodcastEpisodeRequests()
			const loadedPodcastEpisode = player.toLoadedPodcastEpisode()
			const podcastEpisode =
				loadedPodcastEpisode?.id === podcastEpisodeId
					? loadedPodcastEpisode
					: await fetchPodcastEpisode(podcastEpisodeId).catch(() => {
							showClientError("This episode could not load. Try again.")
							return null
						})
			if (!podcastEpisode || !playerStore.isPodcastEpisodeRequestCurrent(version)) {
				return
			}
			const chapter = toChapterAtPosition(podcastEpisode.chapters, chapterPosition)
			await player.playPodcastEpisode(podcastEpisode, chapter?.startSeconds)
		},
	}
}

// mobile and shared controls use the shared player directly
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

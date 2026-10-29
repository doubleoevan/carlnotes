import { setPodcastEpisodeListenAccount } from "@carlnotes/core/stores/podcastEpisodeListenStore"
import { clearPodcastEpisodePlayer, pausePodcastEpisode } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import type { PodcastEpisodeCheckpointStore } from "./podcastEpisodeCheckpoint"

let checkpointStore: PodcastEpisodeCheckpointStore | null = null

/**
 * Registers the current account's playback checkpoint for explicit session cleanup.
 */
export function registerPodcastEpisodeCheckpoint(store: PodcastEpisodeCheckpointStore | null): () => void {
	checkpointStore = store
	return () => {
		if (checkpointStore === store) {
			checkpointStore = null
		}
	}
}

/**
 * Pauses immediately and clears saved playback only when session exit succeeds.
 */
export function toPodcastEpisodeExit(): (isSuccessful: boolean) => Promise<void> {
	pausePodcastEpisode()
	const store = checkpointStore
	return async (isSuccessful) => {
		if (isSuccessful) {
			// retire only the session that began this exit
			if (checkpointStore === store) {
				setPodcastEpisodeListenAccount(null)
				clearPodcastEpisodePlayer()
			}
			await store?.clear()
		}
	}
}

/**
 * Removes a deleted episode's saved position without disturbing another loaded episode.
 */
export async function forgetRemovedPodcastEpisode(id: string): Promise<void> {
	const store = checkpointStore
	await store?.forget(id)
}

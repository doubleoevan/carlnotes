import { fetchPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { useEffect, useState } from "react"

// the fetched podcast episode, or null while it loads or if it failed, and whether the fetch failed
export type FetchedPodcastEpisodeState = { podcastEpisode: PodcastEpisode | null; isFailed: boolean }

/**
 * Fetches a podcast episode by id for a surface that has only its summary, such as the Video dialog.
 */
export function useFetchedPodcastEpisode(podcastEpisodeId: string): FetchedPodcastEpisodeState {
	// the fetch for the current id, kept under that id so a changed id never shows the previous podcast episode
	const [fetchedState, setFetchedState] = useState<FetchedPodcastEpisodeState & { podcastEpisodeId: string }>({
		podcastEpisodeId,
		podcastEpisode: null,
		isFailed: false,
	})

	// fetch the podcast episode, and drop a result that settles after the fetch is aborted
	useEffect(() => {
		const controller = new AbortController()
		void fetchPodcastEpisode(podcastEpisodeId, { signal: controller.signal })
			.catch(() => null)
			// keep only the current fetch's result
			.then((podcastEpisode) => {
				if (!controller.signal.aborted) {
					setFetchedState({ podcastEpisodeId, podcastEpisode, isFailed: !podcastEpisode })
				}
			})
		return () => controller.abort()
	}, [podcastEpisodeId])

	// nothing until the current id's fetch settles
	if (fetchedState.podcastEpisodeId !== podcastEpisodeId) {
		return { podcastEpisode: null, isFailed: false }
	}
	return { podcastEpisode: fetchedState.podcastEpisode, isFailed: fetchedState.isFailed }
}

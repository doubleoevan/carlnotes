// the image of a podcast episode's film as the image block edits it, read from the podcast episode's page for a page
// that has the podcast episode without the editor's view of its film

import { fetchPodcastEpisodePage } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { useEffect, useRef, useState } from "react"
import type { EditableImage } from "../components/TopicImageEditor"
import { toTopicPodcastEpisodeVideoEditableImage } from "../lib/podcastEpisodeEditor"

// the podcast episode whose film's image loads, and the call if its page does not load
type UseTopicPodcastEpisodeVideoEditableImageOptions = {
	podcastEpisode: Pick<PodcastEpisode, "topicId" | "season" | "episodeNumber">
	onLoadFailed: () => void
}

/**
 * Loads the image of a podcast episode's film as the image block edits it. Returns null until the podcast episode's
 * page loads, and calls onLoadFailed if it does not.
 */
export function useTopicPodcastEpisodeVideoEditableImage({
	podcastEpisode: { topicId, season, episodeNumber },
	onLoadFailed,
}: UseTopicPodcastEpisodeVideoEditableImageOptions): EditableImage | null {
	// the film's image once its page loads, and the latest failure call, which a new render replaces without a reload
	const [editableImage, setEditableImage] = useState<EditableImage | null>(null)
	const onLoadFailedRef = useRef(onLoadFailed)
	onLoadFailedRef.current = onLoadFailed

	// read the podcast episode's page once, and drop a read that settles after the hook unmounts
	useEffect(() => {
		const controller = new AbortController()
		void fetchPodcastEpisodePage(
			{ topicId, season: String(season), episodeNumber: String(episodeNumber) },
			{ signal: controller.signal },
		)
			.catch(() => null)
			// keep the read of a hook that is still mounted
			.then((podcastEpisodePageResult) => {
				if (controller.signal.aborted) {
					return
				}
				// a page that the user may not open, or that failed to load, has no image to edit
				if (podcastEpisodePageResult?.status !== "visible") {
					onLoadFailedRef.current()
					return
				}
				// show the film's image from the page
				setEditableImage(toTopicPodcastEpisodeVideoEditableImage(podcastEpisodePageResult.podcastEpisodePage))
			})
		return () => controller.abort()
	}, [topicId, season, episodeNumber])
	return editableImage
}

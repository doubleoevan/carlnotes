// the page that an editor's dialog reads before it opens, for a page without the editor's view of what the dialog
// edits: a podcast episode's page for a topic page's Edit film and Edit podcast, and a topic's page for a podcast
// episode page's Edit topic

import { fetchPodcastEpisodePage } from "@carlnotes/client/podcastEpisodeClient"
import { fetchTopicPage } from "@carlnotes/client/topicClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useEffect, useRef, useState } from "react"

// the podcast episode whose page loads, and the call if its page does not load
type UsePodcastEpisodeEditorPageOptions = {
	podcastEpisode: Pick<PodcastEpisode, "topicId" | "season" | "episodeNumber">
	onLoadFailed: () => void
}

/**
 * Loads a podcast episode's page with the editor's view of the podcast episode and its film. Returns null until the
 * page loads, and calls onLoadFailed if it does not or if the user may not edit the podcast episode.
 */
export function usePodcastEpisodeEditorPage({
	podcastEpisode: { topicId, season, episodeNumber },
	onLoadFailed,
}: UsePodcastEpisodeEditorPageOptions): PodcastEpisodePageResponse | null {
	return useEditorPage({
		pageKey: `${topicId}/${season}/${episodeNumber}`,
		readPage: async (signal) => {
			const podcastEpisodePageResult = await fetchPodcastEpisodePage(
				{ topicId, season: String(season), episodeNumber: String(episodeNumber) },
				{ signal },
			)
			// keep the page of a podcast episode that the user may edit
			const isEditable =
				podcastEpisodePageResult.status === "visible" &&
				podcastEpisodePageResult.podcastEpisodePage.canEditPodcastEpisode
			return isEditable ? podcastEpisodePageResult.podcastEpisodePage : null
		},
		onLoadFailed,
	})
}

// the topic whose page loads, and the call if its page does not load
type UseTopicEditorPageOptions = { topicId: string; onLoadFailed: () => void }

/**
 * Loads a topic's page for the Edit topic form. Returns null until the page loads, and calls onLoadFailed if it does
 * not or if the user may not edit the topic.
 */
export function useTopicEditorPage({ topicId, onLoadFailed }: UseTopicEditorPageOptions): TopicResponse | null {
	return useEditorPage({
		pageKey: topicId,
		readPage: async () => {
			const topicPageResult = await fetchTopicPage(topicId)
			return topicPageResult.status === "visible" && topicPageResult.topic.canEdit ? topicPageResult.topic : null
		},
		onLoadFailed,
	})
}

// the key whose change reads the page again, the read, which returns null for a page the user may not edit, and the
// call if the page does not load
type UseEditorPageOptions<Page> = {
	pageKey: string
	readPage: (signal: AbortSignal) => Promise<Page | null>
	onLoadFailed: () => void
}

// reads the page once for each key and returns it once it loads
function useEditorPage<Page>({ pageKey, readPage, onLoadFailed }: UseEditorPageOptions<Page>): Page | null {
	// the page once it loads, and the latest read and failure call, which a new render replaces without a reload
	const [page, setPage] = useState<Page | null>(null)
	const readPageRef = useRef(readPage)
	readPageRef.current = readPage
	const onLoadFailedRef = useRef(onLoadFailed)
	onLoadFailedRef.current = onLoadFailed

	// read the page, and drop a read that settles after the dialog closes
	// biome-ignore lint/correctness/useExhaustiveDependencies: the page key is the signal to read the page again
	useEffect(() => {
		const controller = new AbortController()
		void readPageRef
			.current(controller.signal)
			.catch(() => null)
			// keep the read of a dialog that is still open
			.then((loadedPage) => {
				if (controller.signal.aborted) {
					return
				}
				// a page that failed to load, or that the user may not edit, has nothing to edit
				if (!loadedPage) {
					onLoadFailedRef.current()
					return
				}
				// the dialog opens with the loaded page
				setPage(loadedPage)
			})
		return () => controller.abort()
	}, [pageKey])
	return page
}

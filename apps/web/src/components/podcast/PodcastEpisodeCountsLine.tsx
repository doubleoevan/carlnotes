import { fetchPodcastEpisodeCounts } from "@carlnotes/client/viewerCountsClient"
import { usePolledCounts } from "@carlnotes/core/hooks/usePolledCounts"
import { toSavedPodcastEpisodeCounts } from "@carlnotes/core/lib/pageReads"
import { useCallback } from "react"
import { FlashingCount } from "@/components/common/FlashingCount"
import { COUNTS_LINE_CLASS } from "@/lib/styleClasses"

/**
 * The podcast episode page's last line, with the podcast episode's listener count: the saved count after the server
 * render, read again a minute later, or empty until the first read if the page has none.
 */
export function PodcastEpisodeCountsLine({
	podcastEpisodeId,
	isPublic,
	savedListenerCount,
}: {
	podcastEpisodeId: string
	isPublic: boolean
	savedListenerCount?: number
}) {
	const readPodcastEpisodeCounts = useCallback(
		(signal: AbortSignal) => fetchPodcastEpisodeCounts(podcastEpisodeId, isPublic, signal),
		[podcastEpisodeId, isPublic],
	)
	const podcastEpisodeCounts = usePolledCounts(
		readPodcastEpisodeCounts,
		true,
		toSavedPodcastEpisodeCounts(savedListenerCount),
	)
	return (
		<p className={COUNTS_LINE_CLASS}>
			{podcastEpisodeCounts && <FlashingCount label="Listeners" count={podcastEpisodeCounts.listenerCount} />}
		</p>
	)
}

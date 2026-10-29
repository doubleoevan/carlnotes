import { fetchPodcastEpisodeCounts } from "@carlnotes/client/viewerCountsClient"
import { usePolledCounts } from "@carlnotes/core/hooks/usePolledCounts"
import { useCallback } from "react"
import { FlashingCount } from "@/components/common/FlashingCount"
import { COUNTS_LINE_CLASS } from "@/lib/styleClasses"

/**
 * The podcast episode page's last line, with the podcast episode's listener count, empty in the server render.
 */
export function PodcastEpisodeCountsLine({
	podcastEpisodeId,
	isPublic,
}: {
	podcastEpisodeId: string
	isPublic: boolean
}) {
	const readPodcastEpisodeCounts = useCallback(
		(signal: AbortSignal) => fetchPodcastEpisodeCounts(podcastEpisodeId, isPublic, signal),
		[podcastEpisodeId, isPublic],
	)
	const podcastEpisodeCounts = usePolledCounts(readPodcastEpisodeCounts)
	return (
		<p className={COUNTS_LINE_CLASS}>
			{podcastEpisodeCounts && <FlashingCount label="Listeners" count={podcastEpisodeCounts.listenerCount} />}
		</p>
	)
}

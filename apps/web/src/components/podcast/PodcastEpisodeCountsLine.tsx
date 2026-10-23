import { fetchPodcastEpisodeCounts } from "@carlnotes/client/viewerCountsClient"
import { useCallback } from "react"
import { FlashingCount } from "@/components/common/FlashingCount"
import { usePolledCounts } from "@/hooks/usePolledCounts"
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
		() => fetchPodcastEpisodeCounts(podcastEpisodeId, isPublic),
		[podcastEpisodeId, isPublic],
	)
	const podcastEpisodeCounts = usePolledCounts(readPodcastEpisodeCounts)
	return (
		<p className={COUNTS_LINE_CLASS}>
			{podcastEpisodeCounts && <FlashingCount label="Listeners" count={podcastEpisodeCounts.listenerCount} />}
		</p>
	)
}

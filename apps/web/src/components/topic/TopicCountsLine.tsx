import { fetchTopicCounts } from "@carlnotes/client/viewerCountsClient"
import { type TopicCounts, VIEWER_COUNT_LABEL } from "@carlnotes/contracts/viewerCounts"
import { usePolledCounts } from "@carlnotes/core/hooks/usePolledCounts"
import { useCallback } from "react"
import { FlashingCount } from "@/components/common/FlashingCount"
import { COUNTS_LINE_CLASS } from "@/lib/styleClasses"

// the topic, whether it is public, and its counts saved with the page, null without them
type TopicCountsLineProps = { topicId: string; isPublic: boolean; savedCounts: TopicCounts | null }

/**
 * The topic page's last line, with the topic's viewer and follower counts, empty in the server render. The counts
 * saved with the page show once it mounts, and the poll reads a minute later.
 */
export function TopicCountsLine({ topicId, isPublic, savedCounts }: TopicCountsLineProps) {
	const readTopicCounts = useCallback(
		(signal: AbortSignal) => fetchTopicCounts(topicId, isPublic, signal),
		[topicId, isPublic],
	)
	const topicCounts = usePolledCounts(readTopicCounts, true, savedCounts)

	// the viewer and follower counts, once the saved counts or the first read arrive
	return (
		<p className={COUNTS_LINE_CLASS}>
			{topicCounts && (
				<>
					<FlashingCount label={VIEWER_COUNT_LABEL} count={topicCounts.viewerCount} />{" "}
					<FlashingCount label="Followers" count={topicCounts.subscriberCount} />
				</>
			)}
		</p>
	)
}

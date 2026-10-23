import { fetchTopicCounts } from "@carlnotes/client/viewerCountsClient"
import { useCallback } from "react"
import { FlashingCount } from "@/components/common/FlashingCount"
import { usePolledCounts } from "@/hooks/usePolledCounts"
import { COUNTS_LINE_CLASS } from "@/lib/styleClasses"

/**
 * The topic page's last line, with the topic's viewer and follower counts, empty in the server render.
 */
export function TopicCountsLine({ topicId, isPublic }: { topicId: string; isPublic: boolean }) {
	const readTopicCounts = useCallback(() => fetchTopicCounts(topicId, isPublic), [topicId, isPublic])
	const topicCounts = usePolledCounts(readTopicCounts)
	return (
		<p className={COUNTS_LINE_CLASS}>
			{topicCounts && (
				<>
					<FlashingCount label="Viewers" count={topicCounts.viewerCount} />{" "}
					<FlashingCount label="Followers" count={topicCounts.subscriberCount} />
				</>
			)}
		</p>
	)
}

import { fetchTopicCounts } from "@carlnotes/client/viewerCountsClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { usePolledCounts } from "@carlnotes/core/hooks/usePolledCounts"
import { usePathname } from "expo-router"
import { useCallback } from "react"
import { View } from "react-native"
import { Count } from "@/components/common/Count"

/**
 * Shows the Topic's live Viewers and Followers with the web's display labels and emphasized counts.
 */
export function TopicCountsLine({ topic }: { topic: TopicResponse }) {
	// read the same counts endpoint as web, every minute while this Topic is the active route
	const pathname = usePathname()
	const readTopicCounts = useCallback(
		(signal: AbortSignal) => fetchTopicCounts(topic.id, topic.visibility === "public", signal),
		[topic.id, topic.visibility],
	)
	const counts = usePolledCounts(readTopicCounts, pathname === `/topics/${topic.id}`)
	return (
		<View className="mx-4 mt-8 min-h-5 flex-row flex-wrap items-center justify-center gap-x-8 gap-y-2">
			{counts ? (
				<>
					<Count label="Viewers" count={counts.viewerCount} />
					<Count label="Followers" count={counts.subscriberCount} />
				</>
			) : null}
		</View>
	)
}

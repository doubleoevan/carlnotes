import { fetchTopicCounts } from "@carlnotes/client/viewerCountsClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { useQuery } from "@tanstack/react-query"
import { usePathname } from "expo-router"
import { View } from "react-native"
import { Text } from "@/components/primitives/text"

// match the web's minute poll, only while this Topic is the active native route
const COUNTS_POLL_MS = 60_000

/**
 * Shows the Topic's live Viewers and Followers with the web's display labels and emphasized counts.
 */
export function TopicCountsLine({ topic }: { topic: TopicResponse }) {
	// read the same counts endpoint as web; failed refreshes keep the last successful counts
	const pathname = usePathname()
	const { data: counts } = useQuery({
		queryKey: ["topic-counts", topic.id],
		queryFn: async () => {
			const counts = await fetchTopicCounts(topic.id, topic.visibility === "public")
			if (!counts) {
				throw new Error("Topic counts are unavailable")
			}
			return counts
		},
		enabled: pathname === `/topics/${topic.id}`,
		staleTime: COUNTS_POLL_MS,
		refetchInterval: COUNTS_POLL_MS,
		retry: false,
		gcTime: 0,
	})
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

// preserve the body font for numbers and the display font for count labels
function Count({ label, count }: { label: string; count: number }) {
	return (
		<View
			accessible
			accessibilityLabel={`${label}: ${count.toLocaleString()}`}
			className="flex-row items-center gap-1.5"
		>
			<Text style={{ fontFamily: fontFamilies.display.name }} className="text-sm text-muted-foreground">
				{label}:
			</Text>
			<Text className="px-1.5 text-sm font-semibold tabular-nums">{count.toLocaleString()}</Text>
		</View>
	)
}

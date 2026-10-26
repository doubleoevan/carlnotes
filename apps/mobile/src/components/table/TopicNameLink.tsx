import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

/**
 * Shares a table's linked Topic name and latest podcast play button.
 */
export function TopicNameLink({
	topic,
}: {
	topic: { id: string; name: string; latestPodcastEpisode: PodcastEpisodeSummary | null }
}) {
	return (
		<View className="min-w-0 flex-1 flex-row items-center gap-2">
			{/* let the name wrap without pushing its play button out of the row */}
			<AnchorLink
				href={{ pathname: "/topics/[topicId]", params: { topicId: topic.id } }}
				accessibilityLabel={`Open ${topic.name}`}
				hitSlop={toTouchTargetHitSlop(24)}
				className="min-w-0 shrink active:opacity-75"
			>
				<Text className="text-sm text-link">{topic.name}</Text>
			</AnchorLink>
			{topic.latestPodcastEpisode ? <PodcastEpisodePlayButton episode={topic.latestPodcastEpisode} /> : null}
		</View>
	)
}

import type { TopicDetails } from "@carlnotes/contracts/topics"
import type { TopicFeedState } from "@carlnotes/core/hooks/useTopicFeedState"
import type { ReactNode } from "react"
import { View } from "react-native"
import type { TopicFindingRow } from "@/topicFeedRows"
import { TopicResource } from "./TopicResource"

// the whole finding list owns its border, rounded corners, and single raised shadow
export type TopicFindingListProps = {
	topic: TopicDetails
	findingRows: TopicFindingRow[]
	state: Pick<TopicFeedState, "handlers" | "pendingChanges">
}

/**
 * Draws a Topic's findings inside the web's single raised card.
 */
export function TopicFindingList({ topic, findingRows, state }: TopicFindingListProps) {
	return (
		<TopicFindingListCard>
			{findingRows.map(({ finding, topicFindingRank, isLast }) => (
				<TopicResource
					key={finding.findingId}
					resource={finding}
					topicFindingRank={topicFindingRank}
					isLast={isLast}
					topic={topic}
					latestPodcastEpisode={topic.latestPodcastEpisode}
					topicFeedHandlers={state.handlers}
					isPending={state.pendingChanges.some((change) => change.findingId === finding.findingId)}
				/>
			))}
		</TopicFindingListCard>
	)
}

/**
 * Keeps feed and search rows inside the same raised list card.
 */
export function TopicFindingListCard({ children }: { children: ReactNode }) {
	return <View className="mx-4 rounded-lg border border-separator bg-card px-3 py-1 shadow-raised">{children}</View>
}

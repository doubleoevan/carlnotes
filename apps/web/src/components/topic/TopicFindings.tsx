import type { TopicResponse } from "@carlnotes/contracts/topics"
import { HydrateSection } from "@/components/topic/HydrateSection"
import { NewCountInfo } from "@/components/topic/Topic"
import { TopicFindingsSection } from "@/components/topic/TopicFindingsSection"
import { useTopicFindings } from "@/hooks/useTopicFindings"
import { type TopicFeedHandlers, useTopicFeed } from "@/providers/TopicFeedProvider"

/**
 * The topic's findings, narrowed and sorted by the shared feed filters. A filter change remounts the section
 * and its hydrate entrance replays.
 */
export function TopicFindings({
	topic,
	topicFeedHandlers,
}: {
	topic: TopicResponse
	topicFeedHandlers: TopicFeedHandlers
}) {
	const { findingFilter, sort, resourceKinds, bookmarkScope } = useTopicFeed()
	const topicFindings = useTopicFindings(topic)
	const viewKey = `${findingFilter}-${sort}-${bookmarkScope}-${[...resourceKinds].sort().join()}`
	return (
		<HydrateSection key={viewKey} index={2}>
			<TopicFindingsSection
				topicFindings={topicFindings}
				hasAnyFindings={topic.findings.length > 0}
				isRatable={topic.canRate}
				isBookmarkable={topic.isTopicOwner || topic.isTeamMember}
				topicFeedHandlers={topicFeedHandlers}
				topic={{
					id: topic.id,
					name: topic.name,
					prompt: topic.prompt,
					visibility: topic.visibility,
					isTopicOwner: topic.isTopicOwner,
					owner: topic.owner,
					teamLink: topic.teamLink,
					image: topic.image,
				}}
				newCountInfo={topic.newCount > 0 ? <NewCountInfo topic={topic} /> : undefined}
				latestPodcastEpisode={topic.latestPodcastEpisode}
			/>
		</HydrateSection>
	)
}

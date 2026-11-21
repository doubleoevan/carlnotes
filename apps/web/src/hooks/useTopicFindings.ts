import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { selectTopicFindings } from "@carlnotes/core/lib/topicFeed"
import { useTopicFeed } from "@/providers/TopicFeedProvider"

/**
 * Returns the findings of a loaded topic that this user sees, narrowed and sorted by the shared feed filters.
 */
export function useTopicFindings(topic: TopicResponse | null | undefined): TopicFinding[] {
	const { findingFilter, sort, resourceKinds, bookmarkScope } = useTopicFeed()
	return selectTopicFindings({ findings: topic?.findings ?? [], resourceKinds, findingFilter, sort, bookmarkScope })
}

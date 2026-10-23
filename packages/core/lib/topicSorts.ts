// what order a section's topics read in under the trending sort

import type { TopicFindingSort } from "@carlnotes/contracts/findings"
import type { TopicSectionKey } from "@carlnotes/contracts/topics"

// the fields the trending order reads from a topic
type TrendingTopic = { id: string; viewerCount: number; subscriberCount: number; feedUpdatedAt: string }

/**
 * Orders topics for trending by viewers, then followers, then the newest finding, then the id.
 */
export function toTrendingTopics<Topic extends TrendingTopic>(topics: Topic[]): Topic[] {
	return [...topics].sort(
		(first, second) =>
			second.viewerCount - first.viewerCount ||
			second.subscriberCount - first.subscriberCount ||
			new Date(second.feedUpdatedAt).getTime() - new Date(first.feedUpdatedAt).getTime() ||
			first.id.localeCompare(second.id),
	)
}

/**
 * Orders a homepage section's topics for the sort mode. Trending reorders every section but Featured, whose order an
 * admin sets, and relevant and newest keep the order the topics were delivered in.
 */
export function toSortedSectionTopics<Topic extends TrendingTopic>(
	sectionKey: TopicSectionKey,
	topics: Topic[],
	sort: TopicFindingSort,
): Topic[] {
	return sort === "trending" && sectionKey !== "featured" ? toTrendingTopics(topics) : topics
}

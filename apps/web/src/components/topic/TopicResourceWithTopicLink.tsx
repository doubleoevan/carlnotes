import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { FindingSearchTopic } from "@carlnotes/contracts/search"
import type { ReactNode } from "react"
import { SearchRowTopicLink } from "@/components/search/SearchRowParts"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { TopicResource } from "./TopicResource"

/**
 * A finding's row outside its topic's page: the feed's own with its note, rating, bookmark, and read toggle, its
 * bookmark mark beside a rank that stays, the pill of the chapter that narrates it, and its topic after its age. The
 * topic's link stops its click, so following it never also opens the note.
 */
export function TopicResourceWithTopicLink({
	resource,
	topic,
	rank,
	latestPodcastEpisode,
	topicFeedHandlers,
	children,
}: {
	resource: TopicFinding
	topic: FindingSearchTopic
	rank: number
	// the finding's topic's latest podcast episode, whose chapters put a pill on the finding if one narrates it
	latestPodcastEpisode: PodcastEpisode | undefined
	topicFeedHandlers?: TopicFeedHandlers
	// what follows the topic on the metadata line
	children?: ReactNode
}) {
	return (
		<TopicResource
			resource={resource}
			rank={rank}
			isRatable={topic.canRate}
			isBookmarkable={topic.canBookmark}
			topicFeedHandlers={topicFeedHandlers}
			topic={topic}
			latestPodcastEpisode={latestPodcastEpisode}
			isBookmarkOnLine
		>
			{/* the dot stays with the topic's name when the line wraps, and the margin evens the line's gap with a space */}
			<span className="-ml-0.5">
				·{" "}
				<span onClickCapture={(event) => event.stopPropagation()}>
					<SearchRowTopicLink topic={topic} />
				</span>
			</span>
			{children}
		</TopicResource>
	)
}

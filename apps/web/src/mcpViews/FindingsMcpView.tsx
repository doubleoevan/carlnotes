import type { TopicFinding } from "@carlnotes/contracts/findings"
import { cn } from "@carlnotes/nightshift/classNames"
import { useEffect, useState } from "react"
import { TopicNameLink } from "@/components/table/TopicNameLink"
import { TopicResource } from "@/components/topic/TopicResource"
import { RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import { McpViewPodcastPlayer } from "./McpViewPodcastPlayer"
import { McpViewSubscribeButton } from "./McpViewSubscribeButton"
import { toMcpViewFindingHandlers } from "./mcpViewFindingHandlers"
import { findMcpViewPodcastEpisode, useMcpViewData } from "./mcpViewHost"

// the findings an MCP view shows if its tool result has none, one list so the rows below never reset on each render
const NO_TOPIC_FINDINGS: TopicFinding[] = []

/**
 * The findings MCP view: the feed's finding rows under the topic's name, its latest podcast episode's play button, and
 * Follow. A signed-in caller's thumbs, bookmark, and done call the rating, bookmark, and consumed tools through the host.
 */
export function FindingsMcpView() {
	const { topic, topicFindings: mcpViewTopicFindings = NO_TOPIC_FINDINGS } = useMcpViewData()

	// the rows as the last call left them, each change shown once its tool saves it
	const [topicFindings, setTopicFindings] = useState<TopicFinding[]>(mcpViewTopicFindings)
	useEffect(() => setTopicFindings(mcpViewTopicFindings), [mcpViewTopicFindings])
	if (!topic) {
		return null
	}

	// the row handlers, each a tool call whose change shows on its row once it saves
	const topicFeedHandlers = toMcpViewFindingHandlers(({ findingId, topicFindingChange }) =>
		setTopicFindings((previousTopicFindings) =>
			previousTopicFindings.map((topicFinding) =>
				topicFinding.findingId === findingId ? { ...topicFinding, ...topicFindingChange } : topicFinding,
			),
		),
	)
	const latestPodcastEpisode = topic.latestPodcastEpisode
		? findMcpViewPodcastEpisode(topic.latestPodcastEpisode.id)
		: null
	return (
		<div>
			{/* the topic's name with its latest podcast episode's play button, and Follow */}
			<div className="mb-2 flex items-center justify-between gap-3">
				<span className="font-display min-w-0 text-lg">
					<TopicNameLink topic={topic} />
				</span>
				<McpViewSubscribeButton topicId={topic.id} isSubscribed={topic.isSubscribed} />
			</div>
			{/* the finding rows, numbered in the order the tool returned them */}
			<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
				{topicFindings.map((topicFinding, index) => (
					<TopicResource
						key={topicFinding.findingId}
						resource={topicFinding}
						rank={index + 1}
						isRatable={topic.canRate}
						isBookmarkable={topic.canBookmark}
						topicFeedHandlers={topicFeedHandlers}
						topic={topic}
						latestPodcastEpisode={latestPodcastEpisode}
					/>
				))}
			</div>
			<McpViewPodcastPlayer />
		</div>
	)
}

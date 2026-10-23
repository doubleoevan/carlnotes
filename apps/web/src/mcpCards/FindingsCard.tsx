import type { TopicFinding } from "@carlnotes/contracts/findings"
import { useEffect, useState } from "react"
import { TopicNameLink } from "@/components/table/TopicNameLink"
import { TopicResource } from "@/components/topic/TopicResource"
import { RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { CardPodcastPlayer } from "./CardPodcastPlayer"
import { CardSubscribeButton } from "./CardSubscribeButton"
import { toCardFindingHandlers } from "./cardFindingHandlers"
import { findCardPodcastEpisode, useCardData } from "./cardHost"

// the findings a card shows if its tool result has none, one list so the rows below never reset on each render
const NO_TOPIC_FINDINGS: TopicFinding[] = []

/**
 * The findings card: the feed's finding rows under the topic's name, its latest podcast episode's play button, and
 * Follow. A signed-in caller's thumbs, bookmark, and done call the rating, bookmark, and consumed tools through the host.
 */
export function FindingsCard() {
	const { topic, topicFindings: cardTopicFindings = NO_TOPIC_FINDINGS } = useCardData()

	// the rows as the last call left them, each change shown once its tool saves it
	const [topicFindings, setTopicFindings] = useState<TopicFinding[]>(cardTopicFindings)
	useEffect(() => setTopicFindings(cardTopicFindings), [cardTopicFindings])
	if (!topic) {
		return null
	}

	// the row handlers, each a tool call whose change shows on its row once it saves
	const topicFeedHandlers = toCardFindingHandlers(({ findingId, topicFindingChange }) =>
		setTopicFindings((previousTopicFindings) =>
			previousTopicFindings.map((topicFinding) =>
				topicFinding.findingId === findingId ? { ...topicFinding, ...topicFindingChange } : topicFinding,
			),
		),
	)
	const latestPodcastEpisode = topic.latestPodcastEpisode ? findCardPodcastEpisode(topic.latestPodcastEpisode.id) : null
	return (
		<div>
			{/* the topic's name with its latest podcast episode's play button, and Follow */}
			<div className="mb-2 flex items-center justify-between gap-3">
				<span className="font-display min-w-0 text-lg">
					<TopicNameLink topic={topic} />
				</span>
				<CardSubscribeButton topicId={topic.id} isSubscribed={topic.isSubscribed} />
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
			<CardPodcastPlayer />
		</div>
	)
}

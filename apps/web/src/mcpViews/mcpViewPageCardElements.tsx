// the cards of a profile's and a team's sections in an MCP view

import { PodcastEpisodeCard } from "@carlnotes/core/components/PodcastEpisodeCard"
import type { PageSectionsElements } from "@carlnotes/core/components/pageSectionsElements"
import { PODCAST_EPISODE_CARD_ELEMENTS } from "@/components/podcast/PodcastEpisodeCard"
import { McpViewTopicCard } from "./McpViewTopicCard"
import { McpViewTopicPostCard } from "./TopicPostsMcpView"

// the web's podcast episode card with no film button
const MCP_VIEW_PODCAST_EPISODE_CARD_ELEMENTS = { ...PODCAST_EPISODE_CARD_ELEMENTS, VideoButton: () => null }

/**
 * The cards of a profile's and a team's sections in an MCP view. A Topic's card and a Topic Post's card take the one hop
 * in the MCP view, and a podcast episode's card plays the recording the tool result includes.
 */
export const MCP_VIEW_PAGE_CARD_ELEMENTS: Pick<
	PageSectionsElements,
	"TopicCard" | "PodcastEpisodeCard" | "TopicPostCard"
> = {
	TopicCard: McpViewTopicCard,
	PodcastEpisodeCard: ({ podcastEpisodeCard, videoSurface }) => (
		<PodcastEpisodeCard
			podcastEpisodeCard={podcastEpisodeCard}
			variant={videoSurface ? "video" : undefined}
			videoSurface={videoSurface}
			elements={MCP_VIEW_PODCAST_EPISODE_CARD_ELEMENTS}
		/>
	),
	TopicPostCard: McpViewTopicPostCard,
}

// what an MCP view replaces in a Topic Post's info popup: reactions that save through their tool, no Share, and a
// discussion play button that plays the recording a tool result holds
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { TopicPostInfoElements } from "@carlnotes/core/components/TopicPostInfo"
import { togglePlayback } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { playPodcastEpisode, toLoadedPodcastEpisode } from "@/stores/podcastEpisodePlayerStore"
import { McpViewReactionRow } from "./McpViewReactionRow"
import { findMcpViewPodcastEpisode } from "./mcpViewHost"

/**
 * The discussion's play button in an MCP view. A tool result holds the recording with the caller's play token on its
 * audio url, so a press plays that one in place of a read of the post.
 */
export function McpViewDiscussionPlayButton({ podcastEpisode }: { podcastEpisode: PodcastEpisode }) {
	const handlePress = (): void => {
		if (toLoadedPodcastEpisode()?.id === podcastEpisode.id) {
			togglePlayback()
			return
		}

		// play the recording the tool result gave the MCP view
		const mcpViewPodcastEpisode = findMcpViewPodcastEpisode(podcastEpisode.id)
		if (mcpViewPodcastEpisode) {
			void playPodcastEpisode(mcpViewPodcastEpisode)
		}
	}
	return <PodcastEpisodePlayButton podcastEpisode={podcastEpisode} size="default" onPress={handlePress} />
}

/**
 * The elements an MCP view replaces in a Topic Post's info popup. A frame cannot write to the clipboard, so the popup
 * offers no Share.
 */
export const MCP_VIEW_TOPIC_POST_INFO_ELEMENTS: Partial<TopicPostInfoElements> = {
	Reactions: (props) => <McpViewReactionRow {...props} className="flex flex-col gap-1" />,
	ShareButton: () => null,
	PlayButton: McpViewDiscussionPlayButton,
}

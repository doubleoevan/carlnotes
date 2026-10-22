import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { ICON_TILE_BUTTON_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

// the topic that a topic table row names, and its latest podcast episode that the user may listen to
type TopicNameLinkTopic = { id: string; name: string; latestPodcastEpisode: PodcastEpisodeSummary | null }

/**
 * A topic's name in a topic table, linking to its page, with the user's update count at its corner
 * and the play button of its latest podcast episode beside the name.
 */
export function TopicNameLink({ topic }: { topic: TopicNameLinkTopic }) {
	return (
		<span className="flex items-center gap-2">
			{/* the name and its update count badge, which wraps without pushing the play button under the name */}
			<span className="relative min-w-0">
				<AnchorLink href={toTopicPath(topic)} className={STANDALONE_LINK_CLASS}>
					{topic.name}
				</AnchorLink>
				<PageUpdateCountBadge topicId={topic.id} />
			</span>

			{/* the latest podcast episode's play button */}
			{topic.latestPodcastEpisode && (
				<PodcastEpisodePlayButton podcastEpisode={topic.latestPodcastEpisode} className={ICON_TILE_BUTTON_CLASS} />
			)}
		</span>
	)
}

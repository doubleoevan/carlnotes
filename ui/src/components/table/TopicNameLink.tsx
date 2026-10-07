import type { PodcastEpisode } from "@shared/contracts"
import { toTopicPath } from "@shared/seo"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { LatestPodcastEpisodePlayButton } from "@/components/podcast/LatestPodcastEpisodePlayButton"
import { ICON_TILE_BUTTON_CLASS } from "@/lib/styleClasses"

// the topic that a topic table row names, and its latest podcast episode that the user may listen to
type TopicNameLinkTopic = { id: string; name: string; latestPodcastEpisode: PodcastEpisode | null }

/**
 * A topic's name in a topic table, linking to its page, with the user's update count at its corner
 * and the play button of its latest podcast episode beside the name.
 */
export function TopicNameLink({ topic }: { topic: TopicNameLinkTopic }) {
	return (
		<span className="flex items-center gap-2">
			{/* the name and its update count badge, which wraps without pushing the play button under the name */}
			<span className="relative min-w-0">
				<AnchorLink href={toTopicPath(topic)} className="text-link hover:underline">
					{topic.name}
				</AnchorLink>
				<PageUpdateCountBadge topicId={topic.id} />
			</span>

			{/* the latest podcast episode's play button */}
			{topic.latestPodcastEpisode && (
				<LatestPodcastEpisodePlayButton
					podcastEpisode={topic.latestPodcastEpisode}
					className={ICON_TILE_BUTTON_CLASS}
				/>
			)}
		</span>
	)
}

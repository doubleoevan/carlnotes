import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toTopicPath } from "@carlnotes/contracts/seo"
import type { ComponentProps, ComponentType, ReactNode } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { PLAY_BUTTON_TILE_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

// the topic that a topic table row names, and its latest podcast episode that the user may listen to
type TopicNameLinkTopic = { id: string; name: string; latestPodcastEpisode: PodcastEpisodeSummary | null }

// the link the name opens the topic through: the site's page by default, or an MCP view's own link
type TopicLinkElement = ComponentType<{ topicId: string; href: string; className?: string; children: ReactNode }>

/**
 * A topic's name in a topic table, linking to its page, with the user's update count at its corner
 * and the play button of its latest podcast episode beside the name.
 */
export function TopicNameLink({
	topic,
	TopicLink = TopicPageLink,
}: {
	topic: TopicNameLinkTopic
	TopicLink?: TopicLinkElement
}) {
	return (
		<span className="flex items-center gap-2">
			{/* the name and its update count badge, which wraps without pushing the play button under the name */}
			<span className="relative min-w-0">
				<TopicLink topicId={topic.id} href={toTopicPath(topic)} className={STANDALONE_LINK_CLASS}>
					{topic.name}
				</TopicLink>
				<PageUpdateCountBadge topicId={topic.id} />
			</span>

			{/* the latest podcast episode's play button */}
			{topic.latestPodcastEpisode && (
				<PodcastEpisodePlayButton podcastEpisode={topic.latestPodcastEpisode} className={PLAY_BUTTON_TILE_CLASS} />
			)}
		</span>
	)
}

// a link to the topic's page on the site
function TopicPageLink({ href, className, children }: ComponentProps<TopicLinkElement>) {
	return (
		<AnchorLink href={href} className={className}>
			{children}
		</AnchorLink>
	)
}

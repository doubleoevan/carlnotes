// the topic video section under the topic header: the film player with the topic's latest film, or a film from Coffee
// Break films, open on each page load until the user collapses it. a topic whose only film is rendering shows the
// rendering card in the film player's place, and its page is read again until the film is ready
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { ComponentType, ReactNode } from "react"
import { useTopicVideoRenderingPoll } from "../hooks/useTopicVideoRenderingPoll"
import {
	type PodcastEpisodeProgressLine,
	TOPIC_VIDEO_RENDERING_LINE,
	TOPIC_VIDEO_SECTION_TITLE,
} from "../lib/podcastEpisodeCopy"
import { toTopicPageTopicVideoSection, toTopicVideoDisplay } from "../lib/topicVideoDisplay"
import {
	setTopicVideoSectionOpen,
	type TopicVideoSection as TopicVideoSectionRead,
	useTopicVideoSection,
} from "../stores/topicVideoSectionStore"

// each app's collapsible section, film player, and rendering card
export type TopicVideoSectionElements = {
	// the platform's collapsible section. it keeps its content mounted while closed, and scrolls into view each time
	// the scroll request count rises
	Section: ComponentType<{
		title: string
		isOpen: boolean
		onOpenChange: (isOpen: boolean) => void
		scrollRequestCount: number
		children: ReactNode
	}>
	// the film player, which the section shows in a card
	Player: ComponentType<{ podcastEpisode: PodcastEpisode; isCard?: boolean; cardFooter?: ReactNode }>
	// the card that says the film is rendering, in the film player's place
	RenderingCard: ComponentType<{ podcastEpisode: PodcastEpisode }>
	// the shimmering line after its emoji
	ProgressLine: ComponentType<PodcastEpisodeProgressLine>
}

// the topic, the report of a user's toggle, the read of the topic's page again while a film renders, and the app's
// elements
type TopicVideoSectionProps = {
	topic: TopicResponse
	onToggled: (isOpen: boolean) => void
	onVideoRenderingPoll: () => void | Promise<void>
	elements: TopicVideoSectionElements
}

/**
 * Composes the topic video section for a topic with a film, or with a latest film that is rendering. A topic with
 * neither shows nothing.
 */
export function TopicVideoSection({ topic, onToggled, onVideoRenderingPoll, elements }: TopicVideoSectionProps) {
	const topicVideoSection = toTopicPageTopicVideoSection(topic)
	if (!topicVideoSection) {
		return null
	}
	return (
		<TopicVideoSectionBody
			topicId={topic.id}
			latestPodcastEpisode={topic.latestPodcastEpisode}
			topicVideoSection={topicVideoSection}
			onToggled={onToggled}
			onVideoRenderingPoll={onVideoRenderingPoll}
			elements={elements}
		/>
	)
}

// the section for a topic with a film. the player stays mounted while collapsed, so a Coffee Break films row can play
// into it
function TopicVideoSectionBody({
	topicId,
	latestPodcastEpisode,
	topicVideoSection,
	onToggled,
	onVideoRenderingPoll,
	elements: { Section, Player, RenderingCard, ProgressLine },
}: {
	topicId: string
	latestPodcastEpisode: TopicResponse["latestPodcastEpisode"]
	topicVideoSection: TopicVideoSectionRead
	onToggled: (isOpen: boolean) => void
	onVideoRenderingPoll: () => void | Promise<void>
	elements: TopicVideoSectionElements
}) {
	// the shown film, whether the section is open, and how many times a row asked for it
	const { podcastEpisode, isOpen, scrollRequestCount } = useTopicVideoSection(topicId, topicVideoSection)

	// read the topic's page again while the shown film renders
	const isVideoRendering = toTopicVideoDisplay(podcastEpisode) === "rendering"
	useTopicVideoRenderingPoll({ isVideoRendering, onPoll: onVideoRenderingPoll })

	// the topic's newer film, still rendering while an older one plays here
	const isNewerVideoRendering =
		latestPodcastEpisode?.isVideoRendering === true && latestPodcastEpisode.id !== podcastEpisode.id
	return (
		<Section
			title={TOPIC_VIDEO_SECTION_TITLE}
			isOpen={isOpen}
			onOpenChange={(isSectionOpen) => {
				setTopicVideoSectionOpen({ topicId, isOpen: isSectionOpen })
				onToggled(isSectionOpen)
			}}
			scrollRequestCount={scrollRequestCount}
		>
			{/* the rendering card while the film renders, and the film player once it is ready */}
			{isVideoRendering ? (
				<RenderingCard podcastEpisode={podcastEpisode} />
			) : (
				<Player
					podcastEpisode={podcastEpisode}
					isCard
					cardFooter={isNewerVideoRendering && <ProgressLine {...TOPIC_VIDEO_RENDERING_LINE} />}
				/>
			)}
		</Section>
	)
}

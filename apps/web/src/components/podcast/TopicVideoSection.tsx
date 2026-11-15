import { FILM_ANCHOR_ID } from "@carlnotes/contracts/podcastEpisodes"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	TopicVideoSection as SharedTopicVideoSection,
	type TopicVideoSectionElements,
} from "@carlnotes/core/components/TopicVideoSection"
import { type ComponentProps, useEffect, useRef } from "react"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { captureFilmVisitEvent } from "@/lib/visitAnalytics"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"
import { TopicVideoPlayer } from "./TopicVideoPlayer"
import {
	UNPUBLISHED_PODCAST_EPISODE_CARD_ELEMENTS,
	UnpublishedPodcastEpisodeCard,
} from "./UnpublishedPodcastEpisodeCard"

const elements: TopicVideoSectionElements = {
	Section: TopicVideoCollapsibleSection,
	Player: TopicVideoPlayer,
	RenderingCard: ({ podcastEpisode }) => (
		<UnpublishedPodcastEpisodeCard podcastEpisode={podcastEpisode} isVideoRendering />
	),
	ProgressLine: UNPUBLISHED_PODCAST_EPISODE_CARD_ELEMENTS.ProgressLine,
}

// the topic, and the read of its page again while its film renders
type TopicVideoSectionProps = {
	topic: TopicResponse
	onVideoRenderingPoll: () => void | Promise<void>
}

/**
 * Adapts the topic video section to the page's collapsible section, which scrolls into view each time a row asks. A topic
 * with no film, ready or rendering, shows nothing.
 */
export function TopicVideoSection({ topic, onVideoRenderingPoll }: TopicVideoSectionProps) {
	return (
		<SharedTopicVideoSection
			topic={topic}
			onToggled={(isOpen) =>
				captureFilmVisitEvent("visit_episode_video_section_toggled", { topicId: topic.id, isOpen })
			}
			onVideoRenderingPoll={onVideoRenderingPoll}
			elements={elements}
		/>
	)
}

// the collapsible section, kept mounted while closed, with the theme song's credits right after its title and a divider
// under it while closed
function TopicVideoCollapsibleSection({
	title,
	isOpen,
	onOpenChange,
	scrollRequestCount,
	children,
}: ComponentProps<TopicVideoSectionElements["Section"]>) {
	// scroll the section into view each time the count rises
	const sectionRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (scrollRequestCount > 0) {
			sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
		}
	}, [scrollRequestCount])
	return (
		<div ref={sectionRef} id={FILM_ANCHOR_ID} className="scroll-mt-20">
			<CollapsibleSection
				value="topic-video"
				title={title}
				titleNote={<PodcastThemeSongNote />}
				isOpen={isOpen}
				onOpenChange={onOpenChange}
				isContentKept
				hasClosedDivider
				className="mt-2"
			>
				{children}
			</CollapsibleSection>
		</div>
	)
}

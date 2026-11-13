import { FILM_ANCHOR_ID } from "@carlnotes/contracts/podcastEpisodes"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	TopicPodcastEpisodeVideoSection as SharedTopicPodcastEpisodeVideoSection,
	type TopicPodcastEpisodeVideoSectionElements,
} from "@carlnotes/core/components/TopicPodcastEpisodeVideoSection"
import { type ComponentProps, useEffect, useRef } from "react"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { captureFilmVisitEvent } from "@/lib/visitAnalytics"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"
import { TopicPodcastEpisodeVideoPlayer } from "./TopicPodcastEpisodeVideoPlayer"
import {
	UNPUBLISHED_PODCAST_EPISODE_CARD_ELEMENTS,
	UnpublishedPodcastEpisodeCard,
} from "./UnpublishedPodcastEpisodeCard"

const elements: TopicPodcastEpisodeVideoSectionElements = {
	Section: TopicCinemaSection,
	Player: TopicPodcastEpisodeVideoPlayer,
	RenderingCard: ({ podcastEpisode }) => (
		<UnpublishedPodcastEpisodeCard podcastEpisode={podcastEpisode} isVideoRendering />
	),
	ProgressLine: UNPUBLISHED_PODCAST_EPISODE_CARD_ELEMENTS.ProgressLine,
}

// the topic, and the read of its page again while its film renders
type TopicPodcastEpisodeVideoSectionProps = {
	topic: TopicResponse
	onVideoRenderingPoll: () => void | Promise<void>
}

/**
 * Adapts Topic Cinema to the page's accordion section, which scrolls into view each time a row asks. A topic with no
 * film, ready or rendering, shows nothing.
 */
export function TopicPodcastEpisodeVideoSection({ topic, onVideoRenderingPoll }: TopicPodcastEpisodeVideoSectionProps) {
	return (
		<SharedTopicPodcastEpisodeVideoSection
			topic={topic}
			onToggled={(isOpen) =>
				captureFilmVisitEvent("visit_episode_video_section_toggled", { topicId: topic.id, isOpen })
			}
			onVideoRenderingPoll={onVideoRenderingPoll}
			elements={elements}
		/>
	)
}

// the accordion section, kept mounted while closed, with the theme song's credits right after its title and a divider
// under it while closed
function TopicCinemaSection({
	title,
	isOpen,
	onOpenChange,
	scrollRequestCount,
	children,
}: ComponentProps<TopicPodcastEpisodeVideoSectionElements["Section"]>) {
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
				value="topic-cinema"
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

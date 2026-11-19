import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	TopicVideoSection as SharedTopicVideoSection,
	type TopicVideoSectionElements,
} from "@carlnotes/core/components/TopicVideoSection"
import { type ComponentProps, useMemo } from "react"
import { View } from "react-native"
import { CARDS_SECTION_ELEMENTS } from "@/components/common/CardsSection"
import { Pagination } from "@/components/common/Pagination"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { captureFilmVisitEvent } from "@/visitAnalytics"
import { PodcastEpisodeCard } from "./PodcastEpisodeCard"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"
import { PodcastEpisodeProgressLine } from "./UnpublishedPodcastEpisodeCard"

// the topic, and the read of its screen again while its film renders
type TopicVideoSectionProps = {
	topic: TopicResponse
	onVideoRenderingPoll: () => void | Promise<void>
}

// the home's card cells, with the column of cards and the page buttons inside the topic screen's own side inset, the
// film card whose play reports the topic-videos surface, and the filming line
const TOPIC_VIDEO_SECTION_ELEMENTS: Omit<TopicVideoSectionElements, "Section"> = {
	...CARDS_SECTION_ELEMENTS,
	Grid: ({ children }) => <View className="gap-3 pt-2 pb-2">{children}</View>,
	Pagination: ({ label, pageNumber, pageCount, onOpenPage }) => (
		<View className="pt-1 pb-2">
			<Pagination label={label} pageNumber={pageNumber} pageCount={pageCount} onOpenPage={onOpenPage} />
		</View>
	),
	FilmCard: ({ podcastEpisodeCard }) => (
		<PodcastEpisodeCard podcastEpisodeCard={podcastEpisodeCard} variant="video" videoSurface="topic-videos" />
	),
	RenderingLine: (progressLine) => (
		<PodcastEpisodeProgressLine {...progressLine} className="text-sm font-semibold text-muted-foreground" />
	),
}

/**
 * Adapts the topic video section to the screen's collapsible section and the home's cards. A topic with no film, ready
 * or rendering, shows nothing.
 */
export function TopicVideoSection({ topic, onVideoRenderingPoll }: TopicVideoSectionProps) {
	// keep the section's renderer stable across the topic's reads, so its open state and page stay
	const elements = useMemo<TopicVideoSectionElements>(
		() => ({
			...TOPIC_VIDEO_SECTION_ELEMENTS,
			// biome-ignore lint/correctness/noComponentHookFactories: memoized on the topic, so the section stays mounted
			Section: (sectionProps) => <TopicVideoCollapsibleSection {...sectionProps} topicId={topic.id} />,
		}),
		[topic.id],
	)
	return <SharedTopicVideoSection topic={topic} onVideoRenderingPoll={onVideoRenderingPoll} elements={elements} />
}

// the collapsible section, open on every screen load and kept mounted while closed, with the theme song's credits right
// after its title, the film count at its far right, and a divider under it while closed. the filming line sits under
// the title, above the cards, and the page buttons under them
function TopicVideoCollapsibleSection({
	title,
	countLabel,
	action,
	pageButtons,
	children,
	topicId,
}: ComponentProps<TopicVideoSectionElements["Section"]> & { topicId: string }) {
	return (
		<CollapsibleSection
			title={title}
			titleNote={<PodcastThemeSongNote />}
			countLabel={countLabel}
			onOpenChange={(isOpen) => captureFilmVisitEvent("visit_episode_video_section_toggled", { topicId, isOpen })}
			isContentKept
			hasClosedDivider
		>
			<View className="gap-3">
				{action}
				{children}
				{pageButtons}
			</View>
		</CollapsibleSection>
	)
}

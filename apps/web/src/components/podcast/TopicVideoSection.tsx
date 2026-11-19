import { FILM_ANCHOR_ID } from "@carlnotes/contracts/podcastEpisodes"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	TopicVideoSection as SharedTopicVideoSection,
	type TopicVideoSectionElements,
} from "@carlnotes/core/components/TopicVideoSection"
import { toCountBesideTitleFrom } from "@carlnotes/nightshift/cardGrid"
import { type ComponentProps, useMemo } from "react"
import { CARDS_SECTION_ELEMENTS } from "@/components/common/CardsSection"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { captureFilmVisitEvent } from "@/lib/visitAnalytics"
import { PodcastEpisodeCard } from "./PodcastEpisodeCard"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"
import { PodcastEpisodeProgressLine } from "./UnpublishedPodcastEpisodeCard"

// the topic, and the read of its page again while its film renders
type TopicVideoSectionProps = {
	topic: TopicResponse
	onVideoRenderingPoll: () => void | Promise<void>
}

// the home's grid, cells, and page buttons, the film card whose play reports the topic-videos surface, and the filming
// line at the size of the film count
const TOPIC_VIDEO_SECTION_ELEMENTS: Omit<TopicVideoSectionElements, "Section"> = {
	...CARDS_SECTION_ELEMENTS,
	FilmCard: ({ podcastEpisodeCard }) => (
		<PodcastEpisodeCard podcastEpisodeCard={podcastEpisodeCard} variant="video" videoSurface="topic-videos" />
	),
	RenderingLine: (progressLine) => (
		<PodcastEpisodeProgressLine {...progressLine} className="text-muted-foreground text-sm font-semibold" />
	),
}

/**
 * Adapts the topic video section to the page's collapsible section and the home's card grid. A topic with no film,
 * ready or rendering, shows nothing.
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

// the collapsible section at the film anchor, open on every page load and kept in the html while closed, with the theme
// song's credits right after its title, and a divider under it while closed. the film count sits at the far right, or
// right after the title while the cards end short of the far right. the filming line sits right before the count and
// wraps to its own line at the left if the row runs out of room. the page buttons sit under the cards
function TopicVideoCollapsibleSection({
	value,
	title,
	countLabel,
	cardCount,
	action,
	pageButtons,
	children,
	topicId,
}: ComponentProps<TopicVideoSectionElements["Section"]> & { topicId: string }) {
	return (
		<CollapsibleSection
			value={value}
			title={title}
			titleNote={<PodcastThemeSongNote />}
			titleAside={action}
			countLabel={countLabel}
			countBesideTitleFrom={toCountBesideTitleFrom(cardCount)}
			onOpenChange={(isOpen) => captureFilmVisitEvent("visit_episode_video_section_toggled", { topicId, isOpen })}
			canWrapHeader
			isContentKept
			hasClosedDivider
			id={FILM_ANCHOR_ID}
			className="mt-2"
		>
			<div className="flex flex-col gap-4">
				{children}
				{pageButtons}
			</div>
		</CollapsibleSection>
	)
}

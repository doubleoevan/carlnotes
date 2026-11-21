// the topic video section under the topic header: every ready film of the topic as a film card, newest first, six to a
// page, in the home's card section pieces. while the topic's latest film renders, the section's action is the filming
// line, and the film's status is read until the film leaves rendering, then the topic's page once
import type { PodcastEpisodeCard } from "@carlnotes/contracts/home"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { ComponentType } from "react"
import { useTopicVideoRenderingPoll } from "../hooks/useTopicVideoRenderingPoll"
import { type CardSection, TOPIC_VIDEO_CARD_SECTION } from "../lib/cardSections"
import {
	type PodcastEpisodeProgressLine,
	TOPIC_VIDEO_RENDERING_LINE,
	TOPIC_VIDEO_SECTION_TITLE,
} from "../lib/podcastEpisodeCopy"
import { type CardsSectionElements, PagedCardsSection } from "./CardsSection"

// the topic video section's accordion value, title, and what its count counts
const TOPIC_VIDEO_SECTION: CardSection<PodcastEpisodeCard> = {
	value: "topic-video",
	title: TOPIC_VIDEO_SECTION_TITLE,
	...TOPIC_VIDEO_CARD_SECTION,
}

// each app's card section pieces with the page's own collapsible section, then the film card and the filming line
export type TopicVideoSectionElements = CardsSectionElements & {
	FilmCard: ComponentType<{ podcastEpisodeCard: PodcastEpisodeCard }>
	RenderingLine: ComponentType<PodcastEpisodeProgressLine>
}

// the topic, the read of its page again once its film leaves rendering, whether the film's poll may run, which a
// covered screen turns off, and the app's elements
type TopicVideoSectionProps = {
	topic: TopicResponse
	onVideoRenderingPoll: () => void | Promise<void>
	isVideoRenderingPollEnabled?: boolean
	elements: TopicVideoSectionElements
}

/**
 * Composes the topic video section for a topic with a ready film, or with a latest film that is rendering. A topic
 * with neither shows nothing.
 */
export function TopicVideoSection({
	topic,
	onVideoRenderingPoll,
	isVideoRenderingPollEnabled = true,
	elements,
}: TopicVideoSectionProps) {
	const { Section, FilmCard, RenderingLine } = elements

	// the topic's film cards, and the filming line if the latest podcast episode's film is rendering. the poll reads
	// that newer film's status, also while the section shows an older film
	const topicPodcastEpisodeVideoCards = topic.topicPodcastEpisodeVideoCards ?? []
	const isVideoRendering = topic.latestPodcastEpisode?.isVideoRendering === true
	useTopicVideoRenderingPoll({
		podcastEpisodeId: topic.latestPodcastEpisode?.id,
		isTopicPublic: topic.visibility === "public",
		isVideoRendering,
		onPoll: onVideoRenderingPoll,
		isEnabled: isVideoRenderingPollEnabled,
	})
	const renderingLine = isVideoRendering && <RenderingLine {...TOPIC_VIDEO_RENDERING_LINE} />

	// the filming line alone for a topic with no ready film
	if (topicPodcastEpisodeVideoCards.length === 0) {
		return (
			renderingLine && (
				<Section
					value={TOPIC_VIDEO_SECTION.value}
					title={TOPIC_VIDEO_SECTION.title}
					countLabel=""
					cardCount={0}
					action={renderingLine}
				>
					{null}
				</Section>
			)
		)
	}
	return (
		<PagedCardsSection
			section={TOPIC_VIDEO_SECTION}
			rows={topicPodcastEpisodeVideoCards}
			action={renderingLine}
			renderCard={(podcastEpisodeCard) => <FilmCard podcastEpisodeCard={podcastEpisodeCard} />}
			elements={elements}
		/>
	)
}

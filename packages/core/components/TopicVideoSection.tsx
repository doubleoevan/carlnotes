// the topic video section under the topic header: every ready film of the topic as a film card, newest first, six to a
// page, in the home's card section pieces. while the topic's latest film renders, the filming card sits above the cards, and the
// topic's page is read again until the film is ready
import type { PodcastEpisodeCard } from "@carlnotes/contracts/home"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { ComponentType } from "react"
import { useTopicVideoRenderingPoll } from "../hooks/useTopicVideoRenderingPoll"
import { type CardSection, TOPIC_VIDEO_CARD_SECTION } from "../lib/cardSections"
import { TOPIC_VIDEO_SECTION_TITLE } from "../lib/podcastEpisodeCopy"
import { type CardsSectionElements, PagedCardsSection } from "./CardsSection"

// the topic video section's accordion value, title, and what its count counts
const TOPIC_VIDEO_SECTION: CardSection<PodcastEpisodeCard> = {
	value: "topic-video",
	title: TOPIC_VIDEO_SECTION_TITLE,
	...TOPIC_VIDEO_CARD_SECTION,
}

// each app's card section pieces with the page's own collapsible section, then the film card and the filming card
export type TopicVideoSectionElements = CardsSectionElements & {
	FilmCard: ComponentType<{ podcastEpisodeCard: PodcastEpisodeCard }>
	RenderingCard: ComponentType<{ podcastEpisode: PodcastEpisode }>
}

// the topic, the read of its page again while its film renders, and the app's elements
type TopicVideoSectionProps = {
	topic: TopicResponse
	onVideoRenderingPoll: () => void | Promise<void>
	elements: TopicVideoSectionElements
}

/**
 * Composes the topic video section for a topic with a ready film, or with a latest film that is rendering. A topic
 * with neither shows nothing.
 */
export function TopicVideoSection({ topic, onVideoRenderingPoll, elements }: TopicVideoSectionProps) {
	const { Section, FilmCard, RenderingCard } = elements

	// the topic's film cards, and the latest podcast episode if its film is rendering
	const topicPodcastEpisodeVideoCards = topic.topicPodcastEpisodeVideoCards ?? []
	const renderingPodcastEpisode = topic.latestPodcastEpisode?.isVideoRendering ? topic.latestPodcastEpisode : null
	useTopicVideoRenderingPoll({ isVideoRendering: renderingPodcastEpisode !== null, onPoll: onVideoRenderingPoll })
	const renderingCard = renderingPodcastEpisode && <RenderingCard podcastEpisode={renderingPodcastEpisode} />

	// the filming card alone for a topic with no ready film
	if (topicPodcastEpisodeVideoCards.length === 0) {
		return (
			renderingCard && (
				<Section value={TOPIC_VIDEO_SECTION.value} title={TOPIC_VIDEO_SECTION.title} countLabel="" cardCount={0}>
					{renderingCard}
				</Section>
			)
		)
	}
	return (
		<PagedCardsSection
			section={TOPIC_VIDEO_SECTION}
			rows={topicPodcastEpisodeVideoCards}
			action={renderingCard}
			renderCard={(podcastEpisodeCard) => <FilmCard podcastEpisodeCard={podcastEpisodeCard} />}
			elements={elements}
		/>
	)
}

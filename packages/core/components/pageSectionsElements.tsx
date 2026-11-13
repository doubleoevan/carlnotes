// the elements a profile's and a team's sections share: the group around the sections, the card sections with their
// cards, a collapsible section with its title and count, and an empty section's card
import type {
	PodcastEpisodeCard as PodcastEpisodeCardFields,
	TopicCard as TopicCardFields,
} from "@carlnotes/contracts/home"
import type { TopicPostCard as TopicPostCardFields } from "@carlnotes/contracts/topicPosts"
import type { TopicPodcastEpisodeVideoDialogSurface } from "@carlnotes/contracts/visitAnalytics"
import type { ComponentType, ReactNode } from "react"
import type { CardSection } from "../lib/cardSections"

export type PageSectionsElements = {
	// the card sections and the table sections together
	SectionsGroup: ComponentType<{ children: ReactNode }>
	PagedCardsSection: <Row>(props: {
		section: CardSection<Row>
		rows: Row[]
		renderCard: (row: Row) => ReactNode
	}) => ReactNode
	TopicCard: ComponentType<{ topic: TopicCardFields }>
	// a podcast episode card, or a film card that opens its film in the page's dialog
	PodcastEpisodeCard: ComponentType<{
		podcastEpisodeCard: PodcastEpisodeCardFields
		videoSurface?: TopicPodcastEpisodeVideoDialogSurface
	}>
	TopicPostCard: ComponentType<{ topicPost: TopicPostCardFields }>
	// a collapsible section with its title and its count at the far right, open at first
	Section: ComponentType<{ value: string; title: string; countLabel: string | undefined; children: ReactNode }>
	EmptyCard: ComponentType<{ text: string }>
}

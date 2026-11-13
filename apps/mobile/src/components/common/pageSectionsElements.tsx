// the native elements a profile's and a team's sections share: the card sections with their cards, the collapsible
// sections every screen's tables sit in, and an empty section's card. the card sections bring their own side insets, so
// their group gives the screen's back and each table section takes it again
import type { PageSectionsElements } from "@carlnotes/core/components/pageSectionsElements"
import { View } from "react-native"
import { PagedCardsSection } from "@/components/common/CardsSection"
import { PodcastEpisodeCard } from "@/components/podcast/PodcastEpisodeCard"
import { EmptyListCard } from "@/components/table/TableCard"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { TopicCard } from "@/components/topic/TopicCard"
import { TopicPostCard } from "@/components/topicPost/TopicPostCard"

export const PAGE_SECTIONS_ELEMENTS: PageSectionsElements = {
	SectionsGroup: ({ children }) => <View className="-mx-4">{children}</View>,
	PagedCardsSection: (props) => <PagedCardsSection {...props} />,
	TopicCard,
	PodcastEpisodeCard: ({ podcastEpisodeCard, videoSurface }) =>
		videoSurface ? (
			<PodcastEpisodeCard podcastEpisodeCard={podcastEpisodeCard} variant="video" videoSurface={videoSurface} />
		) : (
			<PodcastEpisodeCard podcastEpisodeCard={podcastEpisodeCard} />
		),
	TopicPostCard,
	Section: ({ title, countLabel, children }) => (
		<View className="mx-4">
			<CollapsibleSection title={title} countLabel={countLabel}>
				{children}
			</CollapsibleSection>
		</View>
	),
	EmptyCard: EmptyListCard,
}

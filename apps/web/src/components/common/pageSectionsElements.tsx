// the browser elements a profile's and a team's sections share: accordion sections, the card sections with their
// cards, and an empty section's card. the page's accordion holds the sections' open state
import type { PageSectionsElements } from "@carlnotes/core/components/pageSectionsElements"
import { AccordionSection } from "@/components/common/AccordionSection"
import { PagedCardsSection } from "@/components/common/CardsSection"
import { PodcastEpisodeCard } from "@/components/podcast/PodcastEpisodeCard"
import { EmptyListCard } from "@/components/table/TableCard"
import { TopicCard } from "@/components/topic/TopicCard"
import { TopicPostCard } from "@/components/topicPost/TopicPostCard"

export const PAGE_SECTIONS_ELEMENTS: PageSectionsElements = {
	SectionsGroup: ({ children }) => <>{children}</>,
	PagedCardsSection: (props) => <PagedCardsSection {...props} />,
	TopicCard: ({ topic }) => <TopicCard topic={topic} />,
	PodcastEpisodeCard: ({ podcastEpisodeCard, videoSurface }) => (
		<PodcastEpisodeCard
			podcastEpisodeCard={podcastEpisodeCard}
			variant={videoSurface ? "video" : undefined}
			videoSurface={videoSurface}
		/>
	),
	TopicPostCard: ({ topicPost }) => <TopicPostCard topicPost={topicPost} />,
	Section: ({ value, title, countLabel, children }) => (
		<AccordionSection value={value} title={title} countLabel={countLabel}>
			{children}
		</AccordionSection>
	),
	EmptyCard: ({ text }) => <EmptyListCard>{text}</EmptyListCard>,
}

// the mobile podcast episode card: the shared card over a native link, the topic's image, and the play button that
// plays the episode where the card is
import {
	type PodcastEpisodeCardElements,
	type PodcastEpisodeCardProps,
	PodcastEpisodeCard as SharedPodcastEpisodeCard,
} from "@carlnotes/core/components/PodcastEpisodeCard"
import { CARD_ELEMENTS } from "@/components/common/cardElements"
import { Text } from "@/components/primitives/text"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"

// the native elements over the shared card: the title as the card's heading, the text, and the play button, which
// stops the press so it never opens the page
const ELEMENTS: PodcastEpisodeCardElements = {
	...CARD_ELEMENTS,
	Title: CARD_ELEMENTS.Heading,
	Details: ({ children }) => <Text className="text-muted-foreground text-xs">{children}</Text>,
	PlayButton: ({ podcastEpisode }) => <PodcastEpisodePlayButton podcastEpisode={podcastEpisode} size="default" />,
}

/**
 * Renders the shared podcast episode card with native links and the player's play button.
 */
export function PodcastEpisodeCard(props: PodcastEpisodeCardProps) {
	return <SharedPodcastEpisodeCard {...props} elements={ELEMENTS} />
}

// the mobile podcast episode card: the shared card over a native link, the topic's image, the play button that
// plays the episode where the card is, and a film card's play button over its image, which opens its film in a sheet
import {
	type PodcastEpisodeCardElements,
	type PodcastEpisodeCardProps,
	PodcastEpisodeCard as SharedPodcastEpisodeCard,
} from "@carlnotes/core/components/PodcastEpisodeCard"
import { CARD_ELEMENTS } from "@/components/common/cardElements"
import { Text } from "@/components/primitives/text"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"
import { PodcastEpisodeVideoButton } from "./PodcastEpisodeVideoButton"

// the native elements over the shared card: the title as the card's heading, the text, the play button, and a film
// card's play button. both buttons stop the press so it never opens the page
const ELEMENTS: PodcastEpisodeCardElements = {
	...CARD_ELEMENTS,
	Title: CARD_ELEMENTS.Heading,
	Details: ({ children }) => <Text className="text-muted-foreground text-xs">{children}</Text>,
	PlayButton: ({ podcastEpisode }) => <PodcastEpisodePlayButton podcastEpisode={podcastEpisode} size="default" />,
	VideoButton: PodcastEpisodeVideoButton,
}

/**
 * Renders the shared podcast episode card with native links and the player's play button.
 */
export function PodcastEpisodeCard(props: PodcastEpisodeCardProps) {
	return <SharedPodcastEpisodeCard {...props} elements={ELEMENTS} />
}

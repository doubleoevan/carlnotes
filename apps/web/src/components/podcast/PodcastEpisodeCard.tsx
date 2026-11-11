// the web podcast episode card: the shared card over a browser link, the topic's image, the play button that plays
// the episode where the card is, and a film card's play button over its image, which opens its film in a dialog

import {
	type PodcastEpisodeCardElements,
	type PodcastEpisodeCardProps,
	PodcastEpisodeCard as SharedPodcastEpisodeCard,
} from "@carlnotes/core/components/PodcastEpisodeCard"
import { AnchorLink } from "@/components/common/AnchorLink"
import { CARD_ELEMENTS } from "@/components/common/cardElements"
import { STRETCHED_CARD_LINK_CLASS } from "@/lib/styleClasses"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"
import { PodcastEpisodeVideoButton } from "./PodcastEpisodeVideoButton"

// the browser elements over the shared card: the title as the link stretched over the whole card, the text, and the
// play button and a film card's play button above the link
const ELEMENTS: PodcastEpisodeCardElements = {
	...CARD_ELEMENTS,
	Title: ({ path, label, onOpen, children }) => (
		<AnchorLink href={path} aria-label={label} onClick={onOpen} className={STRETCHED_CARD_LINK_CLASS}>
			{children}
		</AnchorLink>
	),
	Details: ({ children }) => <span className="text-muted-foreground text-xs">{children}</span>,
	// the play button sits above the stretched link
	PlayButton: ({ podcastEpisode }) => (
		<div className="relative">
			<PodcastEpisodePlayButton podcastEpisode={podcastEpisode} size="default" />
		</div>
	),
	VideoButton: PodcastEpisodeVideoButton,
}

/**
 * Renders the shared podcast episode card with browser links and the player's play button.
 */
export function PodcastEpisodeCard(props: PodcastEpisodeCardProps) {
	return <SharedPodcastEpisodeCard {...props} elements={ELEMENTS} />
}

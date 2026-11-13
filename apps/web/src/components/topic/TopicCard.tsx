// the web topic card: the shared card over a browser link, the topic image, the byline, badges, and a reaction count
import {
	TopicCard as SharedTopicCard,
	type TopicCardElements,
	type TopicCardProps,
} from "@carlnotes/core/components/TopicCard"
import { AnchorLink } from "@/components/common/AnchorLink"
import { CARD_ELEMENTS } from "@/components/common/cardElements"
import { Badge } from "@/components/primitives/badge"
import { STRETCHED_CARD_LINK_CLASS } from "@/lib/styleClasses"
import { TopicByline } from "./TopicByline"

// the browser elements over the shared card: the name as the link stretched over the whole card, the byline, and a
// badge for a tag
export const TOPIC_CARD_ELEMENTS: TopicCardElements = {
	...CARD_ELEMENTS,
	Name: ({ path, label, onOpen, children }) => (
		<AnchorLink href={path} aria-label={label} onClick={onOpen} className={STRETCHED_CARD_LINK_CLASS}>
			{children}
		</AnchorLink>
	),
	// the byline keeps its own links, which sit above the stretched one and open the profile or the team
	Byline: ({ topic }) => <TopicByline topic={topic} className="relative text-xs" />,
	Tag: ({ children }) => <Badge variant="secondary">{children}</Badge>,
}

/**
 * Renders the shared topic card with browser links and badges.
 */
export function TopicCard(props: TopicCardProps) {
	return <SharedTopicCard {...props} elements={TOPIC_CARD_ELEMENTS} />
}

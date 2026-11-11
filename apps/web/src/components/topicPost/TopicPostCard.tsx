// the web Topic Post card: the shared card over a browser link, the info popover, the author's link, the date, and
// the Draft badge
import {
	TopicPostCard as SharedTopicPostCard,
	type TopicPostCardElements,
	type TopicPostCardProps,
} from "@carlnotes/core/components/TopicPostCard"
import { TOPIC_POST_LABELS } from "@carlnotes/core/lib/topicPosts"
import { AnchorLink } from "@/components/common/AnchorLink"
import { CARD_ELEMENTS } from "@/components/common/cardElements"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Badge } from "@/components/primitives/badge"
import { STRETCHED_CARD_LINK_CLASS } from "@/lib/styleClasses"
import { TopicPostInfo } from "./TopicPostInfo"

/**
 * The line of a card's title, in the title link's own font, so a control after the link sits on the title's line.
 */
export const CARD_TITLE_LINE_CLASS = "font-display text-lg leading-tight"

/**
 * The browser elements over the shared card: the title as the link stretched over the whole card, with the info
 * button after its last word in the title's own text, and the author's link above the stretched link.
 */
export const TOPIC_POST_CARD_ELEMENTS: TopicPostCardElements = {
	...CARD_ELEMENTS,
	Title: ({ path, label, onOpen, aside, children }) => (
		<div className={CARD_TITLE_LINE_CLASS}>
			<AnchorLink href={path} aria-label={label} onClick={onOpen} className={STRETCHED_CARD_LINK_CLASS}>
				{children}
			</AnchorLink>
			{aside}
		</div>
	),
	Info: (props) => <TopicPostInfo {...props} isInline />,
	Byline: ({ author }) => (
		<UserProfileLink user={author} label={TOPIC_POST_LABELS.writtenBy} className="relative text-xs" />
	),
	Details: ({ children }) => <p className="text-muted-foreground text-xs">{children}</p>,
	DraftMark: ({ children }) => <Badge variant="secondary">{children}</Badge>,
}

/**
 * Renders the shared Topic Post card with browser links and badges.
 */
export function TopicPostCard(props: TopicPostCardProps) {
	return <SharedTopicPostCard {...props} elements={TOPIC_POST_CARD_ELEMENTS} />
}

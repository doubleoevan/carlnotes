// the mobile Topic Post card: the shared card over a native link, the info sheet, the author's byline, the reaction
// count, the date, and the Draft badge
import {
	TopicPostCard as SharedTopicPostCard,
	type TopicPostCardElements,
	type TopicPostCardProps,
} from "@carlnotes/core/components/TopicPostCard"
import { TOPIC_POST_LABELS } from "@carlnotes/core/lib/topicPosts"
import { View } from "react-native"
import { CARD_ELEMENTS } from "@/components/common/cardElements"
import { Badge } from "@/components/primitives/badge"
import { Text } from "@/components/primitives/text"
import { TopicByline } from "@/components/topic/TopicByline"
import { TopicPostInfo } from "./TopicPostInfo"

// the native elements over the shared card: the title as the card's heading, the info sheet's button, the author's
// byline, the date, and the Draft badge
const ELEMENTS: TopicPostCardElements = {
	...CARD_ELEMENTS,
	// keep the info button outside the heading's text, so a screen reader exposes it by itself
	Title: ({ aside, children }) => (
		<View className="flex-row items-start gap-1.5">
			<View className="min-w-0 shrink">
				<CARD_ELEMENTS.Heading>{children}</CARD_ELEMENTS.Heading>
			</View>
			{aside}
		</View>
	),
	Info: TopicPostInfo,
	Byline: ({ author }) => (
		<TopicByline topic={{ owner: author, teamLink: null }} label={TOPIC_POST_LABELS.writtenBy} isInset={false} />
	),
	Details: ({ children }) => <Text className="text-xs text-muted-foreground">{children}</Text>,
	DraftMark: ({ children }) => (
		<Badge variant="secondary">
			<Text>{children}</Text>
		</Badge>
	),
}

/**
 * Renders the shared Topic Post card with native links and badges.
 */
export function TopicPostCard(props: TopicPostCardProps) {
	return <SharedTopicPostCard {...props} elements={ELEMENTS} />
}

// the mobile topic card: the shared card over a native link, the topic image, the byline, badges, and a reaction count
import {
	TopicCard as SharedTopicCard,
	type TopicCardElements,
	type TopicCardProps,
} from "@carlnotes/core/components/TopicCard"
import { Heart } from "lucide-react-native"
import { View } from "react-native"
import { CARD_ELEMENTS } from "@/components/common/cardElements"
import { Badge } from "@/components/primitives/badge"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicByline } from "./TopicByline"

// the native elements over the shared card: the name as the card's heading, the byline, a badge for a tag, and the
// reaction count
const ELEMENTS: TopicCardElements = {
	...CARD_ELEMENTS,
	Name: CARD_ELEMENTS.Heading,
	Byline: ({ topic }) => <TopicByline topic={topic} isInset={false} />,
	Tag: ({ children }) => (
		<Badge variant="secondary">
			<Text>{children}</Text>
		</Badge>
	),
	Reactions: ({ count }) => (
		<View className="ml-auto flex-row items-center gap-1">
			<Icon as={Heart} className="size-3 text-muted-foreground" />
			<Text className="text-muted-foreground text-xs">{count}</Text>
		</View>
	),
}

/**
 * Renders the shared topic card with native links and badges.
 */
export function TopicCard(props: TopicCardProps) {
	return <SharedTopicCard {...props} elements={ELEMENTS} />
}

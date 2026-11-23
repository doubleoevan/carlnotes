import { TopicTags as SharedTopicTags, type TopicTagsElements } from "@carlnotes/core/components/TopicTags"
import { View } from "react-native"
import { Badge } from "@/components/primitives/badge"
import { Text } from "@/components/primitives/text"

/**
 * Shows a topic's tags in a row that starts at the left edge and wraps, under the topic's image.
 */
export function TopicTags({ tags }: { tags: string[] }) {
	return <SharedTopicTags tags={tags} elements={TOPIC_TAGS_ELEMENTS} />
}

// React Native has no float, so the row sits at full width under the image row instead of continuing beside it
const TOPIC_TAGS_ELEMENTS: TopicTagsElements = {
	Row: ({ children }) => <View className="mt-1.5 flex-row flex-wrap gap-1">{children}</View>,
	Tag: ({ children }) => (
		<Badge variant="secondary">
			<Text>{children}</Text>
		</Badge>
	),
}

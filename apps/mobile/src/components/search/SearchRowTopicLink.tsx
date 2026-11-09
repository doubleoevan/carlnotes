import { AnchorLink } from "@/components/common/AnchorLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

/**
 * Opens a row's Topic without opening the surrounding finding sheet.
 */
export function SearchRowTopicLink({ topic, prefix }: { topic: { id: string; name: string }; prefix: string }) {
	return (
		<AnchorLink
			href={{ pathname: "/topics/[topicId]", params: { topicId: topic.id } }}
			accessibilityLabel={`Open topic ${topic.name}`}
			onPress={(event) => event.stopPropagation()}
			hitSlop={toTouchTargetHitSlop(20)}
			className="self-start py-0.5"
		>
			<Text className="text-xs text-muted-foreground">
				{prefix}
				{topic.name}
			</Text>
		</AnchorLink>
	)
}

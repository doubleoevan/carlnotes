import {
	TopicPostTag as SharedTopicPostTag,
	type TopicPostTagElements,
	type TopicPostTagProps,
} from "@carlnotes/core/components/TopicPostTag"
import { PenLine } from "lucide-react-native"
import { Pressable, View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Adapts the shared chat post tag to the app's accessible touch target.
 */
export function TopicPostTag(props: TopicPostTagProps) {
	return <SharedTopicPostTag {...props} elements={elements} />
}

// retain the question's width and expose the complete title to assistive technology
const elements: TopicPostTagElements = {
	Link: ({ children, label, path, className }) => (
		<AnchorLink asChild href={path} accessibilityLabel={label}>
			<Pressable
				accessibilityRole="link"
				accessibilityLabel={label}
				hitSlop={toTouchTargetHitSlop(44)}
				className={`${className} flex-row active:opacity-75`}
			>
				{children}
			</Pressable>
		</AnchorLink>
	),
	Tag: ({ children, className }) => <View className={`${className} flex-row`}>{children}</View>,
	Icon: () => <Icon as={PenLine} className="size-3.5 shrink-0 text-muted-foreground" />,
	Label: ({ children }) => (
		<Text numberOfLines={1} className="shrink text-xs text-muted-foreground">
			{children}
		</Text>
	),
}

import {
	TopicDefaultSource as SharedTopicDefaultSource,
	TopicSource as SharedTopicSource,
	type TopicDefaultSourceProps,
	type TopicSourceElements,
	type TopicSourceProps,
} from "@carlnotes/core/components/TopicSource"
import { X } from "lucide-react-native"
import { View } from "react-native"
import { Badge } from "@/components/primitives/badge"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Renders the shared default Source row with mobile add and remove controls.
 */
export function TopicDefaultSource(props: TopicDefaultSourceProps) {
	return <SharedTopicDefaultSource {...props} elements={ELEMENTS} />
}

/**
 * Renders the shared Source row with Nightshift controls and a wrapping summary.
 */
export function TopicSource(props: TopicSourceProps) {
	return <SharedTopicSource {...props} elements={ELEMENTS} />
}

// preserve the web's row structure with accessible touch targets and readable long summaries
const ELEMENTS: TopicSourceElements = {
	Row: ({ children }) => <View className="min-h-12 flex-row items-center gap-2">{children}</View>,
	Kind: ({ sourceKind }) => (
		<Badge variant="outline" className="self-center">
			<Text>{sourceKind}</Text>
		</Badge>
	),
	Summary: ({ children }) => <Text className="min-w-0 flex-1 text-sm text-muted-foreground">{children}</Text>,
	Remove: ({ label, onPress }) => (
		<Button variant="ghost" size="icon" accessibilityLabel={label} onPress={onPress}>
			<Icon as={X} className="size-3.5 text-muted-foreground" />
		</Button>
	),
	Add: ({ label, onPress }) => (
		<Button variant="link" className="self-start px-0" accessibilityLabel={label} onPress={onPress}>
			<Text>{label}</Text>
		</Button>
	),
}

// biome-ignore-all lint/suspicious/noArrayIndexKey: read-only draft list entries retain their displayed order
import {
	TopicDraftCard as SharedTopicDraftCard,
	type TopicDraftCardElements,
	type TopicDraftCardProps,
} from "@carlnotes/core/components/TopicDraftCard"
import { X } from "lucide-react-native"
import { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Adapts the complete shared draft card to native scrolling and controls.
 */
export function TopicDraftCard(props: TopicDraftCardProps) {
	return <SharedTopicDraftCard {...props} elements={TOPIC_DRAFT_ELEMENTS} />
}

// native elements for the shared Topic draft card
const TOPIC_DRAFT_ELEMENTS: TopicDraftCardElements = {
	Frame: ({ children, heading }) => (
		<View accessibilityLabel={heading} className="shrink border-t border-border px-3 py-2">
			{children}
		</View>
	),
	Scroll: ({ children, topicDraft }) => <ScrollBox scrollToTopOn={topicDraft}>{children}</ScrollBox>,
	HeadingRow: ({ children }) => <View className="relative mb-2">{children}</View>,
	Heading: ({ children }) => (
		<Text accessibilityRole="header" className="text-center font-display text-lg">
			{children}
		</Text>
	),
	Dismiss: ({ onDismiss }) => (
		<Button
			accessibilityLabel="Dismiss proposed edit"
			variant="ghost"
			size="icon-sm"
			className="absolute top-0 right-0"
			onPress={onDismiss}
		>
			<Icon as={X} className="size-3.5" />
		</Button>
	),
	Loading: () => <CoffeeLoading />,
	Name: ({ name, topicId }) =>
		topicId ? (
			<AnchorLink href={`/topics/${topicId}`} accessibilityLabel={name}>
				<Text className="mb-2 text-sm text-link">{name}</Text>
			</AnchorLink>
		) : (
			<Text className="mb-2 text-sm">{name}</Text>
		),
	Fields: ({ children }) => <View className="gap-3">{children}</View>,
	Field: ({ label, children }) => (
		<View className="gap-1">
			<Text className="font-display text-sm text-muted-foreground">{label}</Text>
			{typeof children === "string" || Array.isArray(children) ? <Text className="text-sm">{children}</Text> : children}
		</View>
	),
	List: ({ items, isNumbered }) => (
		<View className="gap-0.5">
			{items.map((item, index) => (
				<Text key={`${index}-${item}`} className="text-sm">
					{isNumbered ? `${index + 1}. ${item}` : item}
				</Text>
			))}
		</View>
	),
	Files: ({ files }) => (
		<View className="flex-row flex-wrap gap-1">
			{files.map((file) => (
				<Text key={`${file.name}-${file.size}`} className="rounded bg-muted px-2 py-0.5 text-xs">
					{file.name}
				</Text>
			))}
		</View>
	),
}

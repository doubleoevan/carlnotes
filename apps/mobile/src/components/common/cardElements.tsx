// the native elements a topic card, a podcast episode card, and a Topic Post card share: one pressable link around
// the card, the topic image at the page size, a text row, the reaction count, and the heading over the card's text
import type { CardElements } from "@carlnotes/core/components/cardElements"
import { cn } from "@carlnotes/nightshift/classNames"
import { Heart } from "lucide-react-native"
import type { FunctionComponent } from "react"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicImage } from "@/components/primitives/topic-image"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// the heading is a function component, which a card's name or title element type takes with the link props it ignores
export const CARD_ELEMENTS: CardElements & { Heading: FunctionComponent<{ children: string }> } = {
	Card: ({ path, label, className, onOpen, children }) => (
		<AnchorLink href={path} accessibilityLabel={label} onPress={onOpen} className={cn(className, "active:opacity-75")}>
			{children}
		</AnchorLink>
	),
	Image: ({ image, name, isPending }) => {
		const topicImage = <TopicImage image={image} size="page" name={name} className="rounded-b-none" />
		return isPending ? <SkeletonPulse>{topicImage}</SkeletonPulse> : topicImage
	},
	Heading: ({ children }) => (
		<Text style={toTypeRoleStyle("sectionHeading")} className="text-foreground">
			{children}
		</Text>
	),
	Row: ({ className, children }) => <View className={className}>{children}</View>,
	Reactions: ({ count }) => (
		<View className="ml-auto shrink-0 flex-row items-center gap-1">
			<Icon as={Heart} className="size-3 text-muted-foreground" />
			<Text className="text-xs text-muted-foreground">{count}</Text>
		</View>
	),
}

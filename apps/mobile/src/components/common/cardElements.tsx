// the native elements a topic card and a podcast episode card share: one pressable link around the card, the topic
// image at the page size, a text row, and the heading over the card's text
import type { CardElements } from "@carlnotes/core/components/cardElements"
import { cn } from "@carlnotes/nightshift/classNames"
import type { FunctionComponent } from "react"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
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
	Image: ({ image, name }) => <TopicImage image={image} size="page" name={name} className="rounded-b-none" />,
	Heading: ({ children }) => (
		<Text style={toTypeRoleStyle("sectionHeading")} className="text-foreground">
			{children}
		</Text>
	),
	Row: ({ className, children }) => <View className={className}>{children}</View>,
}

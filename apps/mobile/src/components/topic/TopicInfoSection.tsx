import {
	TopicInfoSection as SharedTopicInfoSection,
	type TopicInfoSectionElements,
	type TopicInfoSectionProps,
} from "@carlnotes/core/components/TopicInfoSection"
import { Text, View } from "react-native"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// native labels use the same Nightshift type role as the browser
const ELEMENTS: TopicInfoSectionElements = {
	Row: ({ children, className }) => <View className={className}>{children}</View>,
	Label: ({ children }) => (
		<Text style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
			{children}
		</Text>
	),
	Content: ({ children }) => <View className="mt-1">{children}</View>,
}

/**
 * Adapts the shared Topic information section to platform elements.
 */
export function TopicInfoSection(props: TopicInfoSectionProps) {
	return <SharedTopicInfoSection {...props} elements={ELEMENTS} />
}

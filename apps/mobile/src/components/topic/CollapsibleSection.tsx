import { ChevronDown, ChevronRight } from "lucide-react-native"
import { type ReactNode, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { Icon } from "@/components/primitives/icon"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * Matches the web's open-by-default Topic page sections.
 */
export function CollapsibleSection({
	title,
	children,
	titleAside,
	titleNote,
}: {
	title: string
	children: ReactNode
	titleAside?: ReactNode
	titleNote?: ReactNode
}) {
	const [isExpanded, setIsExpanded] = useState(true)
	return (
		<View className="mb-3">
			{/* the separate aside never toggles the section */}
			<View className="flex-row items-center gap-2">
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={title}
					accessibilityState={{ expanded: isExpanded }}
					onPress={() => setIsExpanded(!isExpanded)}
					className="min-h-12 flex-1 flex-row items-center gap-2 py-2 active:opacity-75"
				>
					<Icon as={isExpanded ? ChevronDown : ChevronRight} className="size-4 text-muted-foreground" />
					<Text accessibilityRole="header" style={toTypeRoleStyle("sectionHeading")} className="shrink text-foreground">
						{title}
					</Text>
				</Pressable>
				{titleNote}
				{titleAside}
			</View>
			{isExpanded ? children : null}
		</View>
	)
}

import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronDown, ChevronRight } from "lucide-react-native"
import type { ReactNode } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SKELETON_SHAPE_CLASS } from "@/sectionClasses"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * One section of a screen's list of sections, as the Topics tab and Home draw them, matching the web's: the title with
 * its count at the far right, and a divider under the section only while it is closed.
 */
export function AccordionSection({
	title,
	countLabel,
	isExpanded,
	isLoading,
	onToggle,
	children,
}: {
	title: string
	// the section's count, such as "6 topics", or nothing until it is known
	countLabel?: string
	isExpanded: boolean
	// whether the section is a screen's loading state, which shows a placeholder for its title and its count
	isLoading?: boolean
	onToggle: () => void
	children?: ReactNode
}) {
	return (
		<View>
			<View className={cn("mx-4", !isExpanded && "border-b border-separator")}>
				<Button
					variant="ghost"
					className="min-h-11 justify-start px-0 pt-3 pb-1"
					accessibilityLabel={countLabel ? `${title}, ${countLabel}` : title}
					accessibilityState={{ expanded: isExpanded }}
					disabled={isLoading}
					onPress={onToggle}
				>
					<Icon as={isExpanded ? ChevronDown : ChevronRight} />
					{/* the title and the count, or their placeholders on the title's own line */}
					{isLoading ? (
						<View className="min-h-7 flex-1 justify-center">
							<View className={cn(SKELETON_SHAPE_CLASS, "h-5 w-40")} />
						</View>
					) : (
						<Text style={toTypeRoleStyle("sectionTitle")} className="flex-1 text-left">
							{title}
						</Text>
					)}
					{isLoading && <View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-16")} />}
					{!isLoading && countLabel && <Text className="text-muted-foreground">{countLabel}</Text>}
				</Button>
			</View>
			{isExpanded && children}
		</View>
	)
}

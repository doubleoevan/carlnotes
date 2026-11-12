import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react-native"
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
	icon,
	countLabel,
	isExpanded,
	isLoading,
	isContentKept,
	onToggle,
	children,
}: {
	title: string
	// the icon before the title
	icon?: LucideIcon
	// the section's count, such as "6 topics", or nothing until it is known
	countLabel?: string
	isExpanded: boolean
	// whether the section is a screen's loading state, which shows a placeholder for its title and its count
	isLoading?: boolean
	// whether the content stays mounted while closed, for content that holds its own state
	isContentKept?: boolean
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
						<View className="flex-1 flex-row items-center gap-2">
							{icon && <Icon as={icon} className="size-5 text-foreground" />}
							<Text style={toTypeRoleStyle("sectionTitle")} className="shrink text-left">
								{title}
							</Text>
						</View>
					)}
					{isLoading && <View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-16")} />}
					{!isLoading && countLabel && <Text className="text-muted-foreground">{countLabel}</Text>}
				</Button>
			</View>
			{/* the content, hidden instead of unmounted while closed if it is kept */}
			{isContentKept ? <View className={isExpanded ? "flex" : "hidden"}>{children}</View> : isExpanded && children}
		</View>
	)
}

import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronDown, ChevronRight } from "lucide-react-native"
import type { ReactNode } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * One section of a screen's list of sections, as the Topics tab and Home draw them, matching the web's: the title with
 * its count at the far right, and a divider under the section only while it is closed.
 */
export function AccordionSection({
	title,
	countLabel,
	isExpanded,
	onToggle,
	children,
}: {
	title: string
	// the section's count, such as "6 topics", or nothing until it is known
	countLabel?: string
	isExpanded: boolean
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
					onPress={onToggle}
				>
					<Icon as={isExpanded ? ChevronDown : ChevronRight} />
					<Text style={toTypeRoleStyle("logo")} className="flex-1 text-left">
						{title}
					</Text>
					{countLabel && <Text className="text-muted-foreground">{countLabel}</Text>}
				</Button>
			</View>
			{isExpanded && children}
		</View>
	)
}

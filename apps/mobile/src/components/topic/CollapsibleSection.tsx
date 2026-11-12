import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronDown, ChevronRight } from "lucide-react-native"
import { type ReactNode, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { Icon } from "@/components/primitives/icon"
import { COLLAPSIBLE_SECTION_CLASS, COLLAPSIBLE_SECTION_TITLE_ROW_CLASS } from "@/sectionClasses"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * Matches the web's open-by-default Topic page sections, or a section whose open state the caller holds.
 */
export function CollapsibleSection({
	title,
	titleEmoji,
	children,
	titleAside,
	countLabel,
	titleNote,
	isContentKept,
	hasClosedDivider,
	isOpen,
	onOpenChange,
}: {
	title: string
	// an emoji after the title, which the section's accessibility label leaves out
	titleEmoji?: string
	children: ReactNode
	titleAside?: ReactNode
	// the section's count at the far right of its title, such as "6 episodes"
	countLabel?: string
	// what sits right after the title, such as an icon button
	titleNote?: ReactNode
	// whether the content stays mounted while closed, for content that holds its own state
	isContentKept?: boolean
	// whether a divider shows under the section while it is closed, for a section above another section
	hasClosedDivider?: boolean
	// the section's open state and its change, for a section whose state is saved. open by default if left out
	isOpen?: boolean
	onOpenChange?: (isOpen: boolean) => void
}) {
	// the caller's open state, or this section's own
	const [isExpandedState, setIsExpandedState] = useState(true)
	const isExpanded = isOpen ?? isExpandedState
	const toggleExpanded = (): void => {
		setIsExpandedState(!isExpanded)
		onOpenChange?.(!isExpanded)
	}
	return (
		<View className={cn(COLLAPSIBLE_SECTION_CLASS, hasClosedDivider && !isExpanded && "border-b border-separator")}>
			{/* the note and the aside sit beside the toggle, so a press on either never toggles the section. the toggle
			    fills the row, which puts the count and the aside at the far right. with a note, the toggle ends at the
			    title, and the aside and the count move to the far right */}
			<View className="flex-row items-center gap-2">
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={countLabel ? `${title}, ${countLabel}` : title}
					accessibilityState={{ expanded: isExpanded }}
					onPress={toggleExpanded}
					className={cn(COLLAPSIBLE_SECTION_TITLE_ROW_CLASS, "active:opacity-75", titleNote ? "shrink" : "flex-1")}
				>
					<Icon as={isExpanded ? ChevronDown : ChevronRight} className="size-4 text-muted-foreground" />
					<Text
						accessibilityRole="header"
						style={toTypeRoleStyle("sectionTitle")}
						className={cn("text-foreground", titleNote ? "shrink" : "flex-1")}
					>
						{titleEmoji ? `${title} ${titleEmoji}` : title}
					</Text>
					{!titleNote && <SectionCountLabel countLabel={countLabel} />}
				</Pressable>
				{titleNote}
				{titleNote ? (
					<View className="ml-auto flex-row items-center gap-2">
						{titleAside}
						<SectionCountLabel countLabel={countLabel} isHiddenFromScreenReaders />
					</View>
				) : (
					titleAside
				)}
			</View>
			{isContentKept ? <View className={isExpanded ? "flex" : "hidden"}>{children}</View> : null}
			{!isContentKept && isExpanded ? children : null}
		</View>
	)
}

// the section's count, or nothing for a section with no count. outside the toggle it hides from screen readers, which
// read it in the toggle's label
function SectionCountLabel({
	countLabel,
	isHiddenFromScreenReaders = false,
}: {
	countLabel?: string
	isHiddenFromScreenReaders?: boolean
}) {
	if (!countLabel) {
		return null
	}
	return (
		<Text
			accessibilityElementsHidden={isHiddenFromScreenReaders}
			importantForAccessibility={isHiddenFromScreenReaders ? "no" : "auto"}
			className="text-sm text-muted-foreground"
		>
			{countLabel}
		</Text>
	)
}

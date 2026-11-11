import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import { View } from "react-native"
import { COLLAPSIBLE_SECTION_CLASS, COLLAPSIBLE_SECTION_TITLE_ROW_CLASS, SKELETON_SHAPE_CLASS } from "@/sectionClasses"

/**
 * The loading state of a collapsible section, in the section's own box and title row: the caret, the title, and the
 * count as placeholders over the section's loading content.
 */
export function CollapsibleSectionSkeleton({ children }: { children: ReactNode }) {
	return (
		<View className={COLLAPSIBLE_SECTION_CLASS}>
			<View className={COLLAPSIBLE_SECTION_TITLE_ROW_CLASS}>
				<View className={cn(SKELETON_SHAPE_CLASS, "size-4")} />
				{/* the title on the title's own line */}
				<View className="min-h-7 flex-1 justify-center">
					<View className={cn(SKELETON_SHAPE_CLASS, "h-5 w-40")} />
				</View>
				<View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-16")} />
			</View>
			{children}
		</View>
	)
}

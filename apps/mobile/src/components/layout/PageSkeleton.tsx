import {
	type PageSkeletonElements,
	type PageSkeletonProps,
	PageSkeleton as SharedPageSkeleton,
	TableSkeleton as SharedTableSkeleton,
} from "@carlnotes/core/components/PageSkeleton"
import { cn } from "@carlnotes/nightshift/classNames"
import { View } from "react-native"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"

/**
 * Draws the shared page loading layout with native elements and reduced-motion support.
 */
export function PageSkeleton(props: PageSkeletonProps) {
	return <SharedPageSkeleton {...props} elements={PAGE_SKELETON_ELEMENTS} />
}

/**
 * Reserves topics while the rest of a profile is already visible.
 */
export function TableSkeleton() {
	return <SharedTableSkeleton elements={PAGE_SKELETON_ELEMENTS} />
}

// announce one loading state and hide decorative placeholders from assistive technology
const PAGE_SKELETON_ELEMENTS: PageSkeletonElements = {
	Root: ({ label, children }) => (
		<View
			className="w-full"
			accessible
			accessibilityRole="progressbar"
			accessibilityLabel={label}
			accessibilityState={{ busy: true }}
		>
			<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
				<SkeletonPulse>{children}</SkeletonPulse>
			</View>
		</View>
	),
	Stack: ({ className, children }) => <View className={className}>{children}</View>,
	Row: ({ className, children }) => <View className={cn("flex-row items-center", className)}>{children}</View>,
	Shape: ({ className }) => <View className={cn("rounded bg-muted-foreground/20", className)} />,
}

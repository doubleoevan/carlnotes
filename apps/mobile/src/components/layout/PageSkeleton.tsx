import {
	type PageSkeletonElements,
	type PageSkeletonProps,
	PageSkeleton as SharedPageSkeleton,
	TableSkeleton as SharedTableSkeleton,
} from "@carlnotes/core/components/PageSkeleton"
import { cn } from "@carlnotes/nightshift/classNames"
import { View } from "react-native"
import { AccordionSection } from "@/components/common/AccordionSection"
import { CardsRowSkeleton } from "@/components/common/CardsSection"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { NEWS_LIST_ELEMENTS } from "@/components/social/NewsList"
import { TableCard } from "@/components/table/TableCard"
import { CollapsibleSectionSkeleton } from "@/components/topic/CollapsibleSectionSkeleton"
import { AVATAR_HEADER_BUTTON_ROW_CLASS } from "@/pageButtonClasses"
import { NEWS_HEADING_ROW_CLASS, SKELETON_SHAPE_CLASS } from "@/sectionClasses"
import { HEADER_TOPIC_IMAGE_CLASS } from "@/topicImageClasses"

/**
 * Draws the shared page loading layout with the loaded screens' own rows, sections, and cards.
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

// one placeholder for each of the news card's three window choices
const WINDOW_OPTION_KEYS = ["week", "day", "hour"]

// a placeholder section never opens or closes
function handleToggle(): void {}

// the news card before the screen knows whose news it shows: the news list's own card, its heading row with the
// title and the window choices, and the list's own loading rows
function NewsListSkeleton() {
	const { Card, Loading } = NEWS_LIST_ELEMENTS
	return (
		<Card>
			<View className={cn(NEWS_HEADING_ROW_CLASS, "mb-4")}>
				{/* the caret and the title at the title's touch height */}
				<View className="min-h-11 flex-row items-center gap-2">
					<View className={cn(SKELETON_SHAPE_CLASS, "size-4")} />
					<View className={cn(SKELETON_SHAPE_CLASS, "h-5 w-36")} />
				</View>
				{/* the window choices */}
				<View className="flex-row items-center gap-1">
					{WINDOW_OPTION_KEYS.map((windowOptionKey) => (
						<View key={windowOptionKey} className={cn(SKELETON_SHAPE_CLASS, "h-8 w-14 rounded-md")} />
					))}
				</View>
			</View>
			<Loading />
		</Card>
	)
}

// announce one loading state, hide its placeholders from assistive technology, and lay each part out in the classes
// and components its loaded screen uses
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
	Shape: ({ className }) => <View className={cn(SKELETON_SHAPE_CLASS, className)} />,
	ButtonRow: ({ children }) => <View className={AVATAR_HEADER_BUTTON_ROW_CLASS}>{children}</View>,
	// a section of cards is the screen's own accordion section, which brings its own side insets, and a section of a
	// table is the collapsible section's own loading state. a profile's sections follow its news with no
	// margin, so its first section gives the shared layout's margin back
	Section: ({ hasCards, isFlush, children }) =>
		hasCards ? (
			<View className={cn("-mx-4", isFlush && "-mt-4")}>
				<AccordionSection title="" isExpanded isLoading onToggle={handleToggle}>
					{children}
				</AccordionSection>
			</View>
		) : (
			<CollapsibleSectionSkeleton>{children}</CollapsibleSectionSkeleton>
		),
	Card: ({ className, children }) => <TableCard className={cn("p-4", className)}>{children}</TableCard>,
	// a profile's news follows its header 8 points closer than the shared layout's margin
	News: () => (
		<View className="-mt-2">
			<NewsListSkeleton />
		</View>
	),
	CardsRow: CardsRowSkeleton,
	// the header image's frame
	HeaderImage: () => <View className={cn(SKELETON_SHAPE_CLASS, "aspect-[3/2]", HEADER_TOPIC_IMAGE_CLASS)} />,
	// the title's two lines beside the image
	HeaderTitle: () => (
		<View>
			<View className="h-[30px] justify-center">
				<View className={cn(SKELETON_SHAPE_CLASS, "h-6 w-full")} />
			</View>
			<View className="h-[30px] justify-center">
				<View className={cn(SKELETON_SHAPE_CLASS, "h-6 w-2/3")} />
			</View>
		</View>
	),
}

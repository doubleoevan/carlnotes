import { CARDS_PAGE_SIZE } from "@carlnotes/contracts/home"
import {
	type CardsSectionElements,
	CardsSection as SharedCardsSection,
	PagedCardsSection as SharedPagedCardsSection,
} from "@carlnotes/core/components/CardsSection"
import { cn } from "@carlnotes/nightshift/classNames"
import { type ComponentProps, type ReactNode, useState } from "react"
import { View } from "react-native"
import { AccordionSection } from "@/components/common/AccordionSection"
import { Pagination } from "@/components/common/Pagination"
import { SKELETON_SHAPE_CLASS } from "@/sectionClasses"

// a card section's header and content, open at first, with its count at the far right
function CardsSectionFrame({
	title,
	countLabel,
	pageButtons,
	children,
}: {
	title: string
	countLabel: string
	pageButtons?: ReactNode
	children: ReactNode
}) {
	const [isExpanded, setIsExpanded] = useState(true)
	return (
		<AccordionSection
			title={title}
			countLabel={countLabel}
			isExpanded={isExpanded}
			onToggle={() => setIsExpanded(!isExpanded)}
		>
			{children}
			{pageButtons}
		</AccordionSection>
	)
}

// the classes of a section's column of cards, with the section's own side insets
const CARD_GRID_CLASS = "mx-4 gap-3 pt-2 pb-2"

// the app's elements. the cards stack in one column, and a card off the page shown is not rendered
export const CARDS_SECTION_ELEMENTS: CardsSectionElements = {
	Section: CardsSectionFrame,
	Grid: ({ children }) => <View className={CARD_GRID_CLASS}>{children}</View>,
	Cell: ({ isOnPage, children }) => (isOnPage ? <View>{children}</View> : null),
	Pagination: ({ label, pageNumber, pageCount, onOpenPage }) => (
		<View className="mx-4 pt-1 pb-2">
			<Pagination label={label} pageNumber={pageNumber} pageCount={pageCount} onOpenPage={onOpenPage} />
		</View>
	),
}

// one placeholder for each card of a full page of cards
const PAGE_CARD_KEYS = Array.from({ length: CARDS_PAGE_SIZE }, (_, i) => `card-${i}`)

/**
 * The cards of a section while it loads, in the section's own column: one card, as a phone shows one to a row, or a
 * full page of cards for a section that most often fills one.
 */
export function CardsRowSkeleton({ isFullPage = false }: { isFullPage?: boolean }) {
	const cardKeys = isFullPage ? PAGE_CARD_KEYS : PAGE_CARD_KEYS.slice(0, 1)
	return (
		<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className={CARD_GRID_CLASS}>
			{cardKeys.map((cardKey) => (
				<CardSkeleton key={cardKey} />
			))}
		</View>
	)
}

// one card's loading state, the web's card skeleton: the 3:2 image, then the name, the byline, and the tags, each on
// its own line's height
function CardSkeleton() {
	return (
		<View className="overflow-hidden rounded-lg border border-separator bg-card shadow-raised">
			<View className="aspect-[3/2] w-full bg-muted-foreground/20" />
			<View className="gap-2 p-3">
				<View className="h-[22.5px] justify-center">
					<View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-3/4")} />
				</View>
				<View className="h-6 flex-row items-center gap-2">
					<View className={cn(SKELETON_SHAPE_CLASS, "size-6 rounded-full")} />
					<View className={cn(SKELETON_SHAPE_CLASS, "h-3 w-1/2")} />
				</View>
				<View className="h-[22px] flex-row items-center gap-1">
					<View className={cn(SKELETON_SHAPE_CLASS, "h-5 w-14 rounded-full")} />
					<View className={cn(SKELETON_SHAPE_CLASS, "h-5 w-14 rounded-full")} />
				</View>
			</View>
		</View>
	)
}

/**
 * A section of cards on a screen in the app, with its page chosen outside it.
 */
export function CardsSection<Row>(props: Omit<ComponentProps<typeof SharedCardsSection<Row>>, "elements">) {
	return <SharedCardsSection {...props} elements={CARDS_SECTION_ELEMENTS} />
}

/**
 * A section of cards on a screen in the app, which pages through all of its rows by itself.
 */
export function PagedCardsSection<Row>(props: Omit<ComponentProps<typeof SharedPagedCardsSection<Row>>, "elements">) {
	return <SharedPagedCardsSection {...props} elements={CARDS_SECTION_ELEMENTS} />
}

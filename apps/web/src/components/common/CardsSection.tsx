import { CARDS_PAGE_SIZE } from "@carlnotes/contracts/home"
import {
	type CardsSectionElements,
	CardsSection as SharedCardsSection,
	PagedCardsSection as SharedPagedCardsSection,
} from "@carlnotes/core/components/CardsSection"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ComponentProps } from "react"
import { AccordionSection } from "@/components/common/AccordionSection"
import { Pagination } from "@/components/common/Pagination"
import { Card, CardBody } from "@/components/primitives/card"
import { SCRIPTED_HIDDEN_CLASS, SKELETON_SHAPE_CLASS } from "@/lib/styleClasses"

// the classes of a card grid: one column on a phone, two on a tablet, three on a desktop
const CARD_GRID_CLASS = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"

// the web's elements. the section keeps its content in the html while closed, and a card off the page shown is hidden
// only once the script runs, so a crawler and a reader without JavaScript see every card
export const CARDS_SECTION_ELEMENTS: CardsSectionElements = {
	// a section whose cards do not fill a row has its count right after its title: one card from the tablet's two
	// columns up, and two cards on the desktop's three
	Section: ({ value, title, countLabel, cardCount, pageButtons, children }) => (
		<AccordionSection
			value={value}
			title={title}
			countLabel={countLabel}
			countBesideTitleFrom={cardCount < 2 ? "sm" : cardCount < 3 ? "lg" : undefined}
			isContentKept
		>
			{children}
			{pageButtons}
		</AccordionSection>
	),
	Grid: ({ children }) => <div className={CARD_GRID_CLASS}>{children}</div>,
	Cell: ({ isOnPage, children }) => <div className={cn("grid", !isOnPage && SCRIPTED_HIDDEN_CLASS)}>{children}</div>,
	Pagination: ({ label, pageNumber, pageCount, onOpenPage }) => (
		<Pagination ariaLabel={label} pageNumber={pageNumber} pageCount={pageCount} onOpenPage={onOpenPage} />
	),
}

/**
 * A section of cards in a page's accordion on the web, with its page chosen outside it.
 */
export function CardsSection<Row>(props: Omit<ComponentProps<typeof SharedCardsSection<Row>>, "elements">) {
	return <SharedCardsSection {...props} elements={CARDS_SECTION_ELEMENTS} />
}

/**
 * A section of cards in a page's accordion on the web, which pages through all of its rows by itself.
 */
export function PagedCardsSection<Row>(props: Omit<ComponentProps<typeof SharedPagedCardsSection<Row>>, "elements">) {
	return <SharedPagedCardsSection {...props} elements={CARDS_SECTION_ELEMENTS} />
}

// one placeholder for each card of a full page of cards
const PAGE_CARD_KEYS = Array.from({ length: CARDS_PAGE_SIZE }, (_, i) => `card-${i}`)

/**
 * The cards of a section while it loads, in the section's own grid: one row at every width, with one card on a phone,
 * two on a tablet, and three on a desktop, or a full page of cards for a section that most often fills one.
 */
export function CardsRowSkeleton({ isFullPage = false }: { isFullPage?: boolean }) {
	return (
		<div aria-hidden="true" className={CARD_GRID_CLASS}>
			{isFullPage ? (
				PAGE_CARD_KEYS.map((cardKey) => <CardSkeleton key={cardKey} />)
			) : (
				<>
					<CardSkeleton />
					<CardSkeleton className="hidden sm:block" />
					<CardSkeleton className="hidden lg:block" />
				</>
			)}
		</div>
	)
}

// one card's loading state in the card's own box and body: the 3:2 image, then the name, the byline, and the tags,
// each on its own line's height
function CardSkeleton({ className }: { className?: string }) {
	return (
		<Card className={className}>
			<div className={cn(SKELETON_SHAPE_CLASS, "aspect-[3/2] w-full rounded-none")} />
			<CardBody>
				<div className="flex h-[22.5px] items-center">
					<div className={cn(SKELETON_SHAPE_CLASS, "h-4 w-3/4")} />
				</div>
				<div className="flex h-6 items-center gap-2">
					<div className={cn(SKELETON_SHAPE_CLASS, "size-6 shrink-0 rounded-full")} />
					<div className={cn(SKELETON_SHAPE_CLASS, "h-3 w-1/2")} />
				</div>
				<div className="flex h-[22px] items-center gap-1">
					<div className={cn(SKELETON_SHAPE_CLASS, "h-5 w-14 rounded-full")} />
					<div className={cn(SKELETON_SHAPE_CLASS, "h-5 w-14 rounded-full")} />
				</div>
			</CardBody>
		</Card>
	)
}

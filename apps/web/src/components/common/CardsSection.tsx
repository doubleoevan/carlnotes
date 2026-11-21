import { CARDS_PAGE_SIZE } from "@carlnotes/contracts/cardPages"
import {
	type CardsSectionElements,
	PagedCardsSection as SharedPagedCardsSection,
} from "@carlnotes/core/components/CardsSection"
import { CARD_GRID_CLASS, toCountBesideTitleFrom } from "@carlnotes/nightshift/cardGrid"
import { cn } from "@carlnotes/nightshift/classNames"
import { useLocation } from "@tanstack/react-router"
import type { ComponentProps } from "react"
import { AccordionSection } from "@/components/common/AccordionSection"
import { Pagination } from "@/components/common/Pagination"
import { Card, CardBody } from "@/components/primitives/card"
import { SCRIPTED_HIDDEN_CLASS, SKELETON_SHAPE_CLASS } from "@/lib/styleClasses"
import { shouldHandleLinkClick } from "@/lib/utils"

// the web's elements. the section keeps its content in the html while closed, and a card off the page shown is hidden
// only once the script runs, so a crawler and a reader without JavaScript see every card
export const CARDS_SECTION_ELEMENTS: CardsSectionElements = {
	// a section whose cards do not fill a row has its count right after its title
	Section: ({ value, title, countLabel, cardCount, pageButtons, children }) => (
		<AccordionSection
			value={value}
			title={title}
			countLabel={countLabel}
			countBesideTitleFrom={toCountBesideTitleFrom(cardCount)}
			isContentKept
		>
			{children}
			{pageButtons}
		</AccordionSection>
	),
	Grid: ({ children }) => <div className={CARD_GRID_CLASS}>{children}</div>,
	Cell: ({ isOnPage, children }) => <div className={cn("grid", !isOnPage && SCRIPTED_HIDDEN_CLASS)}>{children}</div>,
	Pagination: ({ label, pageNumber, pageCount, onOpenPage, pageSearchKey }) =>
		pageSearchKey ? (
			<PageLinksPagination
				label={label}
				pageNumber={pageNumber}
				pageCount={pageCount}
				onOpenPage={onOpenPage}
				pageSearchKey={pageSearchKey}
			/>
		) : (
			<Pagination ariaLabel={label} pageNumber={pageNumber} pageCount={pageCount} onOpenPage={onOpenPage} />
		),
}

// the shared page buttons' props, with the url search key that names the section's page always set
type PageLinksPaginationProps = ComponentProps<CardsSectionElements["Pagination"]> & { pageSearchKey: string }

// the page buttons of a section the server pages, as links to the page's url at each page, which a reader without
// JavaScript follows to the server's render of that page. with JavaScript a primary click opens its page in place
function PageLinksPagination({ label, pageNumber, pageCount, onOpenPage, pageSearchKey }: PageLinksPaginationProps) {
	const { pathname, searchStr } = useLocation()
	return (
		<Pagination
			ariaLabel={label}
			pageNumber={pageNumber}
			pageCount={pageCount}
			isPagedOnServer
			renderPageLink={({ linkedPageNumber, label: linkLabel, className, isCurrentPage, onClick }) => (
				<a
					href={toPageHref({ pathname, searchStr, pageSearchKey, pageNumber: linkedPageNumber })}
					aria-current={isCurrentPage ? "page" : undefined}
					className={className}
					onClick={(event) => {
						// a modified or secondary click is the browser's, which opens the link in a new tab or window
						if (!shouldHandleLinkClick(event)) {
							return
						}

						// save where the link sits, then open its page in place
						event.preventDefault()
						onClick(event)
						onOpenPage(linkedPageNumber)
					}}
				>
					{linkLabel}
				</a>
			)}
		/>
	)
}

// the page's path, its url search, the key that names the section's page, and the page from 1
type ToPageHrefOptions = { pathname: string; searchStr: string; pageSearchKey: string; pageNumber: number }

// the url of the page at one page of a section, keeping the url's other search values. the first page leaves the key
// out
function toPageHref({ pathname, searchStr, pageSearchKey, pageNumber }: ToPageHrefOptions): string {
	const searchParams = new URLSearchParams(searchStr)
	if (pageNumber === 1) {
		searchParams.delete(pageSearchKey)
	} else {
		searchParams.set(pageSearchKey, String(pageNumber))
	}
	const search = searchParams.toString()
	return search ? `${pathname}?${search}` : pathname
}

/**
 * A section of cards in a page's accordion on the web, which pages through all of its rows by itself, or which the
 * server pages with its page buttons as links to each page.
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

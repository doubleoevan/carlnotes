import { CARDS_PAGE_SIZE } from "@carlnotes/contracts/home"
import { toCountLabel } from "@carlnotes/contracts/text"
import type { ComponentType, ReactNode } from "react"
import { type PageSelection, usePagination } from "../hooks/usePagination"
import type { CardSection } from "../lib/cardSections"

// the platform elements of a card section: the collapsible section with its title, its count, and the control a
// section may have above its cards, the cards' grid, one card's cell, and the page buttons. a cell off the page shown
// stays in the web's html and is left out of the app
export type CardsSectionElements = {
	Section: ComponentType<{
		value: string
		title: string
		// no count for a section that holds nothing
		countLabel: string
		// how many cards the section holds, which decides where a wide screen puts the count
		cardCount: number
		action?: ReactNode
		children: ReactNode
	}>
	Grid: ComponentType<{ children: ReactNode }>
	Cell: ComponentType<{ isOnPage: boolean; children: ReactNode }>
	Pagination: ComponentType<{
		label: string
		pageNumber: number
		pageCount: number
		onOpenPage: (pageNumber: number) => void
	}>
}

// a section, its cards, the control above them, and how each card is drawn
type PagedCardsSectionProps<Row> = {
	section: CardSection<Row>
	rows: Row[]
	action?: ReactNode
	renderCard: (row: Row) => ReactNode
	elements: CardsSectionElements
}

// a section whose page is chosen outside it. the rows are every row, or the one page the server read
type CardsSectionProps<Row> = PagedCardsSectionProps<Row> & {
	rowCount: number
	pagination: PageSelection
	isPagedOnServer?: boolean
}

/**
 * Shows a section of cards under its title and count, six to a page, with every card it holds, hidden while it has
 * none. The page is chosen outside the section.
 */
export function CardsSection<Row>({
	section,
	rows,
	rowCount,
	pagination,
	isPagedOnServer = false,
	action,
	renderCard,
	elements,
}: CardsSectionProps<Row>) {
	const { Section, Grid, Cell, Pagination } = elements
	if (rowCount === 0) {
		return null
	}

	// the index range of the page shown. a section the server pages holds that page's rows alone
	const pageStartIndex = pagination.page * CARDS_PAGE_SIZE
	const isOnPage = (index: number): boolean =>
		isPagedOnServer || (index >= pageStartIndex && index < pageStartIndex + CARDS_PAGE_SIZE)
	return (
		<Section
			value={section.value}
			title={section.title}
			countLabel={toCountLabel(rowCount, section.noun)}
			cardCount={rowCount}
			action={action}
		>
			<Grid>
				{rows.map((row, index) => (
					<Cell key={section.toRowKey(row)} isOnPage={isOnPage(index)}>
						{renderCard(row)}
					</Cell>
				))}
			</Grid>
			{pagination.pageCount > 1 && (
				<Pagination
					label={`${section.title} pages`}
					pageNumber={pagination.page + 1}
					pageCount={pagination.pageCount}
					onOpenPage={(pageNumber) => pagination.setPage(pageNumber - 1)}
				/>
			)}
		</Section>
	)
}

/**
 * Shows a section of cards that pages through all of its rows by itself.
 */
export function PagedCardsSection<Row>({ section, rows, action, renderCard, elements }: PagedCardsSectionProps<Row>) {
	const { pagination } = usePagination(rows, CARDS_PAGE_SIZE)
	return (
		<CardsSection
			section={section}
			rows={rows}
			rowCount={rows.length}
			pagination={pagination}
			action={action}
			renderCard={renderCard}
			elements={elements}
		/>
	)
}

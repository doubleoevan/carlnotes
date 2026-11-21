// the pages of a card section that the server pages: the page size, the query that asks for pages, the query of one
// later page, and where a page sits in the whole list
import { z } from "zod"

// how many cards one page of a card section holds, and the last page a request may ask for
export const CARDS_PAGE_SIZE = 6
export const CARDS_PAGE_MAX = 10_000

// how many scans one page of a topic's scan history holds
export const TOPIC_SCANS_PAGE_SIZE = 50

// one zero-based page of a card section
const cardsPageNumber = z.coerce.number().int().min(0).max(CARDS_PAGE_MAX)

// the query that asks for one page of a card section, zero-based
export const cardsPageQuery = z.object({ page: cardsPageNumber })

// the query flag that asks a page read for one page of each list it pages, and the zero-based page of one such list.
// a read without the flag holds every list whole
export const pagedQuery = z.object({ paged: z.literal("1").optional() })
export const optionalCardsPageNumber = cardsPageNumber.optional()

// which page of a list a payload holds, zero-based, and how many rows the whole list holds
export const cardsPagePosition = z.object({
	page: z.number().int().nonnegative(),
	totalCount: z.number().int().nonnegative(),
})

export type CardsPagePosition = z.infer<typeof cardsPagePosition>

/**
 * Returns one page of a whole list with where it sits. A page past the list's end is its last page.
 */
export function toCardsPage<Row>(rows: Row[], page: number): { rows: Row[]; position: CardsPagePosition } {
	// the page, kept inside the pages the list holds
	const pageCount = Math.max(1, Math.ceil(rows.length / CARDS_PAGE_SIZE))
	const shownPage = Math.min(page, pageCount - 1)
	return {
		rows: rows.slice(shownPage * CARDS_PAGE_SIZE, (shownPage + 1) * CARDS_PAGE_SIZE),
		position: { page: shownPage, totalCount: rows.length },
	}
}

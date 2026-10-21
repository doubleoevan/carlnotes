// the most slots a row of page links has. five keeps a clicked page in the slot it was clicked in
const PAGINATION_SLOT_LIMIT = 5

// the current page number, from 1, and how many pages the list has
type ToPaginationSlotsOptions = { pageNumber: number; pageCount: number }

/**
 * The slots a row of page links shows. A long list shows the first, current, and last page with a gap where pages are skipped,
 * and a short list shows every page.
 */
export function toPaginationSlots({ pageNumber, pageCount }: ToPaginationSlotsOptions): (number | PaginationGap)[] {
	if (pageCount <= PAGINATION_SLOT_LIMIT) {
		return Array.from({ length: pageCount }, (_, index) => index + 1)
	}

	// the middle slot shows the current page, clamped between page 3 and the third-to-last page
	const middlePageNumber = Math.min(Math.max(pageNumber, 3), pageCount - 2)
	return [
		1,
		middlePageNumber > 3 ? "gap-after-first" : 2,
		middlePageNumber,
		middlePageNumber < pageCount - 2 ? "gap-before-last" : pageCount - 1,
		pageCount,
	]
}

// a gap in the row, where pages are skipped after the first page or before the last
type PaginationGap = "gap-after-first" | "gap-before-last"

import { CARDS_PAGE_SIZE, type CardsPagePosition } from "@carlnotes/contracts/cardPages"
import { useQueries } from "@tanstack/react-query"
import { useState } from "react"
import { toPaginationSlots } from "../lib/paginationSlots"
import type { PageSelection } from "./usePagination"

// one page of a section's cards, and how many cards the whole section holds
export type CardsPageRows<Row> = { rows: Row[]; totalCount: number }

// the page of a section that a page read holds: its cards, which page it is, zero-based, and how many cards the whole
// section holds
export type LoadedCardsPage<Row> = { rows: Row[] } & CardsPagePosition

// a section the server pages: the key that names its list in the query cache, the page its page read holds, and the
// read of any other page. a section whose pages on screen are shorter than the server's names both sizes, and a page
// on screen then slices the server's page that holds it
export type ServerCardPages<Row> = {
	queryKey: readonly unknown[]
	loadedPage: LoadedCardsPage<Row>
	fetchPage: (page: number) => Promise<CardsPageRows<Row>>
	pageSize?: number
	fetchedPageSize?: number
}

// how long a page read ahead stays fresh, so opening it sends no request
const READ_AHEAD_PAGE_FRESH_MS = 60_000

/**
 * Pages through a card section the server pages, six cards at a time unless the section names its sizes. The page read
 * holds one page, and every page that a visible page button opens is read ahead, so opening it shows at once. The page
 * shown stays on screen until the page asked for has loaded, and loadingPage names the page asked for while it loads.
 */
export function useServerPagedCards<Row>({
	queryKey,
	loadedPage,
	fetchPage,
	pageSize = CARDS_PAGE_SIZE,
	fetchedPageSize = pageSize,
}: ServerCardPages<Row>): {
	pageRows: Row[]
	pagination: PageSelection
	loadingPage: number | null
} {
	// how many pages on screen one server page holds, and the server page that holds a page on screen
	const shownPagesPerFetchedPage = Math.max(1, Math.floor(fetchedPageSize / pageSize))
	const toFetchedPage = (page: number): number => Math.floor(page / shownPagesPerFetchedPage)

	// the page asked for, which starts at the page the page read holds and starts there again when that page changes
	const loadedShownPage = loadedPage.page * shownPagesPerFetchedPage
	const [requestedPage, setRequestedPage] = useState(loadedShownPage)
	const [trackedLoadedPage, setTrackedLoadedPage] = useState(loadedPage)
	if (!isSameLoadedPage(trackedLoadedPage, loadedPage)) {
		setTrackedLoadedPage(loadedPage)
		setRequestedPage(loadedShownPage)
	}

	// the page asked for, kept inside the pages the total holds
	const { totalCount } = loadedPage
	const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))
	const currentPage = Math.min(requestedPage, pageCount - 1)

	// the server pages that hold the page asked for and every page a visible page button opens, each read once and kept
	// fresh. a changed total reads them again
	const readPages = [...new Set(toLinkedPages(currentPage, pageCount).map(toFetchedPage))].filter(
		(fetchedPage) => fetchedPage !== loadedPage.page,
	)
	const pageQueries = useQueries({
		queries: readPages.map((fetchedPage) => ({
			queryKey: [...queryKey, totalCount, fetchedPage],
			queryFn: () => fetchPage(fetchedPage),
			staleTime: READ_AHEAD_PAGE_FRESH_MS,
			retry: false,
		})),
	})

	// the server page that holds the page asked for, once it has loaded
	const currentFetchedPage = toFetchedPage(currentPage)
	const currentPageQuery = pageQueries[readPages.indexOf(currentFetchedPage)]
	const requestedFetchedRows = currentFetchedPage === loadedPage.page ? loadedPage.rows : currentPageQuery?.data?.rows

	// the page on screen: the page asked for once its server page has loaded, and the page shown before until then
	const [shownPage, setShownPage] = useState({ page: loadedShownPage, fetchedRows: loadedPage.rows })
	if (requestedFetchedRows && (shownPage.page !== currentPage || shownPage.fetchedRows !== requestedFetchedRows)) {
		setShownPage({ page: currentPage, fetchedRows: requestedFetchedRows })
	}
	const pageOnScreen = requestedFetchedRows ? { page: currentPage, fetchedRows: requestedFetchedRows } : shownPage

	// a server page that is one page on screen is shown whole, and a longer one is sliced to the page on screen
	const pageStartIndex = (pageOnScreen.page % shownPagesPerFetchedPage) * pageSize
	return {
		pageRows:
			shownPagesPerFetchedPage === 1
				? pageOnScreen.fetchedRows
				: pageOnScreen.fetchedRows.slice(pageStartIndex, pageStartIndex + pageSize),
		pagination: { page: pageOnScreen.page, pageCount, setPage: setRequestedPage },
		loadingPage: !requestedFetchedRows && currentPageQuery?.isPending ? currentPage : null,
	}
}

// whether two loaded pages are one: the same cards at the same page of the same total
function isSameLoadedPage<Row>(loadedPageA: LoadedCardsPage<Row>, loadedPageB: LoadedCardsPage<Row>): boolean {
	return (
		loadedPageA.rows === loadedPageB.rows &&
		loadedPageA.page === loadedPageB.page &&
		loadedPageA.totalCount === loadedPageB.totalCount
	)
}

// the zero-based pages that the page buttons shown on a page open: the page itself, each numbered page, and the pages
// the previous and next arrows open
function toLinkedPages(page: number, pageCount: number): number[] {
	if (pageCount <= 1) {
		return []
	}

	// the numbered pages, from 1, and the arrows' pages around the current one, each once and inside the list
	const numberedPages = toPaginationSlots({ pageNumber: page + 1, pageCount }).flatMap((slot) =>
		typeof slot === "number" ? [slot - 1] : [],
	)
	const linkedPages = new Set([page - 1, page, page + 1, ...numberedPages])
	return [...linkedPages].filter((linkedPage) => linkedPage >= 0 && linkedPage < pageCount).sort((a, b) => a - b)
}

// a card section the server pages: the page read's page shows at once, every page a visible page button opens is read
// ahead, so opening one sends no request, and a page that was not read ahead shows once it loads. a page shorter than
// the server's is sliced from the server page that holds it, and a page that loads is named
import { expect, test } from "bun:test"
import { CARDS_PAGE_SIZE } from "@carlnotes/contracts/cardPages"
import {
	type CardsPageRows,
	type LoadedCardsPage,
	useServerPagedCards,
} from "@carlnotes/core/hooks/useServerPagedCards"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// eight pages of six cards, each card named by its page and its place on the page
const TOTAL_COUNT = 8 * CARDS_PAGE_SIZE
function toPageRows(page: number): string[] {
	return Array.from({ length: CARDS_PAGE_SIZE }, (_, index) => `card-${page}-${index}`)
}

// the page read's first page, kept as one object so the hook sees one loaded page
const LOADED_PAGE: LoadedCardsPage<string> = { rows: toPageRows(0), page: 0, totalCount: TOTAL_COUNT }

// a page read that records each page it is asked for, and holds a page back until the test lets it load
function toPageFetcher(heldPage?: number): {
	fetchPage: (page: number) => Promise<CardsPageRows<string>>
	requestedPages: number[]
	loadHeldPage: () => void
} {
	const requestedPages: number[] = []
	let loadHeldPage = (): void => {}
	const fetchPage = (page: number): Promise<CardsPageRows<string>> => {
		requestedPages.push(page)
		const pageRows = { rows: toPageRows(page), totalCount: TOTAL_COUNT }
		if (page !== heldPage) {
			return Promise.resolve(pageRows)
		}
		return new Promise((resolve) => {
			loadHeldPage = () => resolve(pageRows)
		})
	}
	return { fetchPage, requestedPages, loadHeldPage: () => loadHeldPage() }
}

test("every page a visible page button opens is read ahead, and opening one sends no request", async () => {
	// the first page shows at once, and the pages its buttons open are read: 2, 3, and the last, 8
	const { fetchPage, requestedPages } = toPageFetcher()
	const harness = await renderTestHook(() =>
		useServerPagedCards({ queryKey: ["test-cards"], loadedPage: LOADED_PAGE, fetchPage }),
	)
	expect(harness.read().pageRows).toEqual(toPageRows(0))
	expect(harness.read().pagination.pageCount).toBe(8)
	await waitForHook(() => requestedPages.length === 3)
	expect(requestedPages.toSorted()).toEqual([1, 2, 7])

	// opening page 3 shows it at once, from the page read ahead, with no second request for it
	await act(async () => harness.read().pagination.setPage(2))
	expect(harness.read().pageRows).toEqual(toPageRows(2))
	expect(harness.read().pagination.page).toBe(2)
	expect(requestedPages.filter((page) => page === 2)).toHaveLength(1)
	await harness.close()
})

test("a page that was not read ahead shows once it loads, and the page shown stays until then", async () => {
	// page 5 is held back while it loads
	const { fetchPage, requestedPages, loadHeldPage } = toPageFetcher(4)
	const harness = await renderTestHook(() =>
		useServerPagedCards({ queryKey: ["test-cards"], loadedPage: LOADED_PAGE, fetchPage }),
	)
	await waitForHook(() => requestedPages.length === 3)

	// asking for page 5 keeps the first page on screen while page 5 loads
	await act(async () => harness.read().pagination.setPage(4))
	expect(requestedPages).toContain(4)
	expect(harness.read().pageRows).toEqual(toPageRows(0))
	expect(harness.read().pagination.page).toBe(0)

	// page 5 shows once it has loaded
	await act(async () => loadHeldPage())
	await waitForHook(() => harness.read().pagination.page === 4)
	expect(harness.read().pageRows).toEqual(toPageRows(4))
	await harness.close()
})

// a history of 120 scans the server reads 50 at a time, shown five to a page
const SCAN_COUNT = 120
function toScanRows(fetchedPage: number): string[] {
	const rowCount = Math.min(50, SCAN_COUNT - fetchedPage * 50)
	return Array.from({ length: rowCount }, (_, index) => `scan-${fetchedPage * 50 + index}`)
}

// the page read's first 50 scans, kept as one object so the hook sees one loaded page
const LOADED_SCANS_PAGE: LoadedCardsPage<string> = { rows: toScanRows(0), page: 0, totalCount: SCAN_COUNT }

test("pages shorter than the server's are sliced from the server page that holds them, and one that loads is named", async () => {
	// the server's third page is held back while it loads
	const requestedPages: number[] = []
	let loadHeldPage = (): void => {}
	const fetchPage = (fetchedPage: number): Promise<CardsPageRows<string>> => {
		requestedPages.push(fetchedPage)
		const pageRows = { rows: toScanRows(fetchedPage), totalCount: SCAN_COUNT }
		return fetchedPage === 2
			? new Promise((resolve) => {
					loadHeldPage = () => resolve(pageRows)
				})
			: Promise.resolve(pageRows)
	}
	const harness = await renderTestHook(() =>
		useServerPagedCards({
			queryKey: ["test-scans"],
			loadedPage: LOADED_SCANS_PAGE,
			fetchPage,
			pageSize: 5,
			fetchedPageSize: 50,
		}),
	)

	// the first page is five scans of the page read, and the buttons' pages 2, 3, and 24 need the server's last page alone
	expect(harness.read().pageRows).toEqual(toScanRows(0).slice(0, 5))
	expect(harness.read().pagination.pageCount).toBe(24)
	await waitForHook(() => requestedPages.length === 1)
	expect(requestedPages).toEqual([2])

	// page 3 is sliced from the page read with no request
	await act(async () => harness.read().pagination.setPage(2))
	expect(harness.read().pageRows).toEqual(["scan-10", "scan-11", "scan-12", "scan-13", "scan-14"])
	expect(harness.read().loadingPage).toBeNull()

	// page 12 needs the server's second page, which shows once it loads
	await act(async () => harness.read().pagination.setPage(11))
	await waitForHook(() => harness.read().pagination.page === 11)
	expect(harness.read().pageRows).toEqual(["scan-55", "scan-56", "scan-57", "scan-58", "scan-59"])

	// page 24 is named as loading until the server's held third page loads, and the page shown stays until then
	await act(async () => harness.read().pagination.setPage(23))
	expect(harness.read().loadingPage).toBe(23)
	expect(harness.read().pagination.page).toBe(11)
	await act(async () => loadHeldPage())
	await waitForHook(() => harness.read().pagination.page === 23)
	expect(harness.read().pageRows).toEqual(["scan-115", "scan-116", "scan-117", "scan-118", "scan-119"])
	expect(harness.read().loadingPage).toBeNull()
	await harness.close()
})

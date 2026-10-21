import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"
import { type RenderedRow, toRenderedRows } from "@/lib/renderedRows"
import { ONE_PAGE_TABLE_CARD_CLASS, SCRIPTED_PAGINATION_TABLE_CARD_CLASS } from "@/lib/styleClasses"
import { type SortValue, useRowSort } from "./SortableHeader"

// the page-size choices offered by every paginated table
const PAGE_SIZES = [5, 10, 25, 50] as const

// the smallest page a table can be cut into. below this, the pagination controls are hidden
export const SMALLEST_PAGE_SIZE = PAGE_SIZES[0]

// the state the usePagination hook returns
type PaginationState = {
	page: number
	pageCount: number
	pageSize: number
	rowCount: number
	setPage: (page: number) => void
	setPageSize: (pageSize: number) => void
}

// the page's rows, the rows the table renders, and the pagination state
type PaginatedRows<Row> = {
	pageRows: Row[]
	// the page's rows and the list's first NO_SCRIPT_ROW_LIMIT rows, with the rows off the page hidden with JavaScript
	renderedRows: RenderedRow<Row>[]
	pagination: PaginationState
}

/**
 * Returns the current pagination state, with the page's rows and the rows the table renders, starting at ten rows a page
 * unless the table asks for another page size.
 */
export function usePagination<Row>(rows: Row[], initialPageSize = 10): PaginatedRows<Row> {
	const [pageSize, setPageSize] = useState<number>(initialPageSize)
	const [page, setPage] = useState(0)
	// clamp the page count so an updated row set or page size never strands the view on an empty page
	const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
	const currentPage = Math.min(page, pageCount - 1)
	const pageRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
	const renderedRows = toRenderedRows(rows, { pageNumber: currentPage + 1, pageSize })
	return {
		pageRows,
		renderedRows,
		pagination: { page: currentPage, pageCount, pageSize, setPage, setPageSize, rowCount: rows.length },
	}
}

// the column a table starts sorted by, and the page size it starts at
type UsePaginatedRowSortOptions = { initialSort?: { key: string; isDescending?: boolean }; initialPageSize?: number }

/**
 * Returns the current combined pagination and sort state for a table that uses both.
 */
export function usePaginatedRowSort<Row>(
	rows: Row[],
	valueByKey: Record<string, (row: Row) => SortValue>,
	{ initialSort, initialPageSize }: UsePaginatedRowSortOptions = {},
) {
	const rowSort = useRowSort(rows, valueByKey, initialSort)
	const { pageRows, renderedRows, pagination } = usePagination(rowSort.sortedRows, initialPageSize)
	// a sort should start at the top, so a header click returns to page one
	const sort = {
		...rowSort,
		toggleSort: (key: string) => {
			rowSort.toggleSort(key)
			pagination.setPage(0)
		},
	}
	return { pageRows, renderedRows, sort, pagination }
}

/**
 * Returns the card class of a table whose pagination shows only with JavaScript. A table with no more rows than the
 * smallest page size, and every table without JavaScript, ends its card at its last row.
 */
export function toScriptedPaginationCardClass(rowCount: number): string {
	return rowCount > SMALLEST_PAGE_SIZE ? SCRIPTED_PAGINATION_TABLE_CARD_CLASS : ONE_PAGE_TABLE_CARD_CLASS
}

/**
 * The pagination footer under a table whose html holds its first NO_SCRIPT_ROW_LIMIT rows, shown only with JavaScript.
 * A table with no more rows than the smallest page size has none.
 */
export function ScriptedTablePagination(pagination: PaginationState) {
	if (pagination.rowCount <= SMALLEST_PAGE_SIZE) {
		return null
	}
	return (
		<div className="hidden scripted:block">
			<TablePagination {...pagination} />
		</div>
	)
}

/**
 * The pagination footer under a table: the page-size select on the left and the pager on the right.
 */
export function TablePagination({ page, pageCount, pageSize, rowCount, setPage, setPageSize }: PaginationState) {
	// the whole row hides until there are more rows than the smallest page size
	if (rowCount <= PAGE_SIZES[0]) {
		return null
	}
	return (
		<div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
			<label className="flex items-center gap-1.5">
				Rows
				<select
					value={pageSize}
					onChange={(event) => {
						setPageSize(Number(event.target.value))
						setPage(0)
					}}
					className="rounded-md border px-1 py-0.5"
				>
					{PAGE_SIZES.map((pageSizeOption) => (
						<option key={pageSizeOption} value={pageSizeOption}>
							{pageSizeOption}
						</option>
					))}
				</select>
			</label>
			{pageCount > 1 && (
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={() => setPage(page - 1)}
						disabled={page === 0}
						aria-label="Previous page"
						className="hover:text-foreground grid size-6 place-items-center rounded-md border disabled:opacity-40"
					>
						<ChevronLeft className="size-3.5" />
					</button>
					<span>
						Page {page + 1} of {pageCount}
					</span>
					<button
						type="button"
						onClick={() => setPage(page + 1)}
						disabled={page >= pageCount - 1}
						aria-label="Next page"
						className="hover:text-foreground grid size-6 place-items-center rounded-md border disabled:opacity-40"
					>
						<ChevronRight className="size-3.5" />
					</button>
				</div>
			)}
		</div>
	)
}

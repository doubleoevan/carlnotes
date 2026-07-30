import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

import { type SortValue, useRowSort } from "./SortableHeader"

// the page-size choices offered by every paginated table
const PAGE_SIZES = [5, 10, 25, 50] as const

// the state that the usePagination hook returns for sorting and pagination
type PaginationState = {
	page: number
	pageCount: number
	pageSize: number
	rowCount: number
	setPage: (page: number) => void
	setPageSize: (pageSize: number) => void
}

/**
 * The current pagination state
 */
export function usePagination<Row>(rows: Row[]): PaginationState & { pageRows: Row[] } {
	const [pageSize, setPageSize] = useState<number>(10)
	const [page, setPage] = useState(0)
	// clamp the page count so an updated row set or page size never strands the view on an empty page
	const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
	const currentPage = Math.min(page, pageCount - 1)
	const pageRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
	return { pageRows, page: currentPage, pageCount, pageSize, setPage, setPageSize, rowCount: rows.length }
}

/**
 * The current combined pagination and sort state for a table that uses both.
 */
export function usePaginatedRowSort<Row>(
	rows: Row[],
	valueByKey: Record<string, (row: Row) => SortValue>,
	initialSort?: { key: string; isDescending?: boolean },
) {
	const rowSort = useRowSort(rows, valueByKey, initialSort)
	const { pageRows, ...pagination } = usePagination(rowSort.sortedRows)
	// a sort should start at the top, so a header click returns to page one
	const sort = {
		...rowSort,
		toggleSort: (key: string) => {
			rowSort.toggleSort(key)
			pagination.setPage(0)
		},
	}
	return { pageRows, sort, pagination }
}

/**
 * The pagination footer under a table: the page-size select on the left and the pager on the right.
 */
export function TablePagination({ page, pageCount, pageSize, rowCount, setPage, setPageSize }: PaginationState) {
	// the whole row hides until there are more rows than the smallest page size and the table can be more than one page
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
			{/* the pager appears only when there is more than one page */}
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

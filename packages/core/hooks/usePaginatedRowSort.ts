import { type PaginationState, usePagination } from "./usePagination"
import { type RowSort, type RowSortOptions, useRowSort } from "./useRowSort"

// tables share their starting column, page size, and reset after sorting
export type PaginatedRowSortOptions<Row> = RowSortOptions<Row> & { initialPageSize?: number }

/**
 * Sorts every loaded row before pagination and returns to page one when the column changes.
 */
export function usePaginatedRowSort<Row>({
	rows,
	valueByKey,
	initialSort,
	initialPageSize,
}: PaginatedRowSortOptions<Row>): {
	pageRows: Row[]
	sort: RowSort & { sortedRows: Row[] }
	pagination: PaginationState
} {
	// share the complete ordering and page state
	const rowSort = useRowSort({ rows: rows, valueByKey: valueByKey, initialSort: initialSort })
	const { pageRows, pagination } = usePagination(rowSort.sortedRows, initialPageSize)
	const sort = {
		...rowSort,
		toggleSort: (key: string) => {
			// start a new ordering on its first page
			rowSort.toggleSort(key)
			pagination.setPage(0)
		},
	}
	return { pageRows, sort, pagination }
}

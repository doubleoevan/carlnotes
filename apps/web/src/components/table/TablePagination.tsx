import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "@carlnotes/contracts/pagination"
import {
	TablePagination as SharedTablePagination,
	type TablePaginationElements,
} from "@carlnotes/core/components/TablePagination"
import {
	type PaginatedRowSortOptions,
	usePaginatedRowSort as useSharedPaginatedRowSort,
} from "@carlnotes/core/hooks/usePaginatedRowSort"
import { type PaginationState, usePagination as useSharedPagination } from "@carlnotes/core/hooks/usePagination"
import { cn } from "@carlnotes/nightshift/classNames"
import { paginationClasses } from "@carlnotes/nightshift/pagination"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { type RenderedRow, toRenderedRows } from "@/lib/renderedRows"
import { ONE_PAGE_TABLE_CARD_CLASS, SCRIPTED_PAGINATION_TABLE_CARD_CLASS } from "@/lib/styleClasses"

// the smallest page a table can be cut into. below this, the pagination controls are hidden
export const SMALLEST_PAGE_SIZE = PAGE_SIZES[0]

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
export function usePagination<Row>(rows: Row[], initialPageSize: number = DEFAULT_PAGE_SIZE): PaginatedRows<Row> {
	// share the selection rules while keeping the server-rendered row policy on the web
	const { pageRows, pagination } = useSharedPagination(rows, initialPageSize)
	const renderedRows = toRenderedRows(rows, { pageNumber: pagination.page + 1, pageSize: pagination.pageSize })
	return {
		pageRows,
		renderedRows,
		pagination,
	}
}

/**
 * Returns the current combined pagination and sort state for a table that uses both.
 */
export function usePaginatedRowSort<Row>({
	rows,
	valueByKey,
	initialSort,
	initialPageSize,
}: PaginatedRowSortOptions<Row>) {
	// keep the server-rendered row policy around the shared sorting and paging hook
	const { pageRows, sort, pagination } = useSharedPaginatedRowSort({
		rows,
		valueByKey,
		initialSort,
		initialPageSize,
	})
	const renderedRows = toRenderedRows(sort.sortedRows, {
		pageNumber: pagination.page + 1,
		pageSize: pagination.pageSize,
	})
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
export function TablePagination(pagination: PaginationState) {
	return <SharedTablePagination pagination={pagination} elements={TABLE_PAGINATION_ELEMENTS} />
}

// DOM semantics and browser selection stay in the web adapter
const TABLE_PAGINATION_ELEMENTS: TablePaginationElements = {
	Root: ({ children }) => (
		<div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">{children}</div>
	),
	// biome-ignore lint/a11y/noLabelWithoutControl: the shared component supplies its select inside these children
	Rows: ({ children }) => <label className="flex items-center gap-1.5">{children}</label>,
	Text: ({ children }) => <span>{children}</span>,
	Pager: ({ children }) => <div className="flex items-center gap-1.5">{children}</div>,
	Select: ({ value, options, onValueChange }) => (
		<select
			value={value}
			onChange={(event) => onValueChange(Number(event.target.value))}
			className={cn("rounded-md border px-1 py-0.5", paginationClasses.idle.box, paginationClasses.idle.text)}
		>
			{options.map((pageSize) => (
				<option key={pageSize} value={pageSize}>
					{pageSize}
				</option>
			))}
		</select>
	),
	PageButton: ({ direction, label, isDisabled, onPress }) => {
		const Arrow = direction === "previous" ? ChevronLeft : ChevronRight
		return (
			<button
				type="button"
				onClick={onPress}
				disabled={isDisabled}
				aria-label={label}
				className={cn(
					"hover:text-foreground grid size-6 place-items-center rounded-md border disabled:opacity-40",
					paginationClasses.idle.box,
					paginationClasses.idle.text,
				)}
			>
				<Arrow className="size-3.5" />
			</button>
		)
	},
}

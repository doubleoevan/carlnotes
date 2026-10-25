import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import type { RowSort, SortValue } from "./SortableHeader"
import { TableCard } from "./TableCard"
import {
	ScriptedTablePagination,
	SMALLEST_PAGE_SIZE,
	toScriptedPaginationCardClass,
	usePaginatedRowSort,
} from "./TablePagination"

// the section's key and title, its rows and each sortable column's value, the table's own classes, and how to render
// the column headings, a row's cells, and a row's key
type PagedTableSectionProps<Row> = {
	value: string
	title: string
	rows: Row[]
	rowSortValues: Record<string, (row: Row) => SortValue>
	tableClassName?: string
	renderHeadings: (sort: RowSort) => React.ReactNode
	renderRowCells: (row: Row) => React.ReactNode
	toRowKey: (row: Row) => string
}

/**
 * A titled table section whose rows sort by their columns, starting at five a page. Its html holds the first
 * NO_SCRIPT_ROW_LIMIT rows for a browser without JavaScript. A section with no rows renders nothing.
 */
export function PagedTableSection<Row>({
	value,
	title,
	rows,
	rowSortValues,
	tableClassName,
	renderHeadings,
	renderRowCells,
	toRowKey,
}: PagedTableSectionProps<Row>) {
	// the sorted rows the table renders: the page shown, and the first NO_SCRIPT_ROW_LIMIT for a browser without
	// JavaScript, in the order they came in until a column is sorted
	const { renderedRows, sort, pagination } = usePaginatedRowSort(rows, rowSortValues, {
		initialPageSize: SMALLEST_PAGE_SIZE,
	})
	if (rows.length === 0) {
		return null
	}
	return (
		<CollapsibleSection value={value} title={title}>
			<TableCard className={toScriptedPaginationCardClass(rows.length)}>
				<div className={TABLE_SCROLL_CLASS}>
					<table className={cn(TABLE_CLASS, tableClassName)}>
						{/* the sortable column headings */}
						<thead className={TABLE_HEAD_CLASS}>
							<tr>{renderHeadings(sort)}</tr>
						</thead>
						{/* the page's rows and the first NO_SCRIPT_ROW_LIMIT are in the html.
						    with JavaScript, only the rows of the page shown stay visible */}
						<tbody>
							{renderedRows.map(({ row, className }) => (
								<tr key={toRowKey(row)} className={cn("border-b", className)}>
									{renderRowCells(row)}
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{/* the pagination, shown only with JavaScript */}
				<ScriptedTablePagination {...pagination} />
			</TableCard>
		</CollapsibleSection>
	)
}

import { type DataTableElements, DataTable as SharedDataTable } from "@carlnotes/core/components/DataTable"
import type { SortedTableProps } from "@carlnotes/core/lib/tableElements"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/tableClasses"
import { SortableHeader } from "./SortableHeader"
import { TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"

/**
 * A sorted table in its card with the pagination under it.
 */
export function DataTable<Row>({
	rows,
	columns,
	valueByKey,
	initialSort,
	getRowId,
	className,
	elements = DATA_TABLE_ELEMENTS,
	renderDetails,
}: SortedTableProps<Row> & {
	className?: string
	// the table's own elements, such as a wider table, in place of the default ones
	elements?: DataTableElements
	// the subtable an open row shows under itself
	renderDetails?: (row: Row) => ReactNode
}) {
	const { pageRows, sort, pagination } = usePaginatedRowSort({ rows, valueByKey, initialSort })
	return (
		<TableCard className={className}>
			<SharedDataTable
				columns={columns}
				renderedRows={pageRows.map((row) => ({ row }))}
				getRowId={getRowId}
				sort={sort}
				elements={elements}
				renderDetails={renderDetails}
			/>
			<TablePagination {...pagination} />
		</TableCard>
	)
}

// semantic DOM elements for the same table composition used by native screens
export const DATA_TABLE_ELEMENTS: DataTableElements = {
	Table: ({ children }) => (
		<div className={TABLE_SCROLL_CLASS}>
			<table className={TABLE_CLASS}>{children}</table>
		</div>
	),
	Head: ({ children }) => <thead className={TABLE_HEAD_CLASS}>{children}</thead>,
	Body: ({ children }) => <tbody>{children}</tbody>,
	Foot: ({ children }) => <tfoot className="text-muted-foreground">{children}</tfoot>,
	Row: ({ children, hasSeparator, className }) => (
		<tr className={cn(hasSeparator && "border-b", className)}>{children}</tr>
	),
	Cell: ({ children }) => <td className="py-2 pr-4">{children}</td>,
	Details: ({ children, columnCount, hasSeparator }) => (
		<tr className={cn(hasSeparator && "border-b")}>
			<td colSpan={columnCount} className="py-2">
				{children}
			</td>
		</tr>
	),
	Header: ({ column, sort }) =>
		column.isSortable === false ? (
			<th className="py-2 pr-4 font-normal">{column.label}</th>
		) : (
			<SortableHeader
				sort={sort}
				sortKey={column.key}
				label={column.label}
				tooltip={column.tooltip}
				className="py-2 pr-4"
			/>
		),
}

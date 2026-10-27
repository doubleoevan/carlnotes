import {
	type DataTableElements,
	DataTable as SharedDataTable,
	type TableColumn,
} from "@carlnotes/core/components/DataTable"
import { usePaginatedRowSort } from "@carlnotes/core/hooks/usePaginatedRowSort"
import type { RowSort, RowSortOptions } from "@carlnotes/core/hooks/useRowSort"
import { cn } from "@carlnotes/nightshift/classNames"
import { View } from "react-native"
import { Text } from "@/components/primitives/text"
import { SortableHeader } from "./SortableHeader"
import { TableCard } from "./TableCard"
import { TablePagination } from "./TablePagination"
import { TableCell, TableScroll } from "./TableScroll"

/**
 * Adds shared sorting and pagination to the native fixed-column table renderer.
 */
export function DataTable<Row>({
	rows,
	columns,
	valueByKey,
	getRowId,
	initialSort,
}: {
	rows: Row[]
	columns: TableColumn<Row>[]
	valueByKey: RowSortOptions<Row>["valueByKey"]
	getRowId: (row: Row) => string
	initialSort?: RowSortOptions<Row>["initialSort"]
}) {
	const { pageRows, sort, pagination } = usePaginatedRowSort({ rows, valueByKey, initialSort })
	return (
		<TableCard>
			<SharedDataTable
				columns={columns}
				renderedRows={pageRows.map((row) => ({ row }))}
				getRowId={getRowId}
				sort={sort}
				elements={DATA_TABLE_ELEMENTS}
			/>
			<View className="px-4">
				<TablePagination pagination={pagination} />
			</View>
		</TableCard>
	)
}

// all native domain tables use these elements so fixed cells and separators cannot drift
export const DATA_TABLE_ELEMENTS: DataTableElements = {
	Table: ({ columns, children }) => (
		<TableScroll columns={Object.fromEntries(columns.map((column) => [column.key, column.width]))}>
			{children}
		</TableScroll>
	),
	Head: ({ children }) => <View className="border-b border-separator-strong">{children}</View>,
	Body: View,
	Foot: View,
	Row: ({ children, hasSeparator, className }) => (
		<View className={cn("min-h-12 flex-row", hasSeparator && "border-b border-separator", className)}>{children}</View>
	),
	Cell: TableCell,
	Header: TableColumnHeader,
}

// non-sortable action columns keep their heading without pretending to be controls
function TableColumnHeader({
	column,
	sort,
}: {
	column: { key: string; label: string; tooltip?: string; isSortable?: boolean }
	sort: RowSort
}) {
	return (
		<TableCell column={column.key}>
			{column.isSortable === false ? (
				<Text className="text-sm text-muted-foreground">{column.label}</Text>
			) : (
				<SortableHeader sort={sort} sortKey={column.key} label={column.label} tooltip={column.tooltip} />
			)}
		</TableCell>
	)
}

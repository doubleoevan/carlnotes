import type { DataTableElements } from "@carlnotes/core/components/DataTable"
import type { RowSort } from "@carlnotes/core/hooks/useRowSort"
import { cn } from "@carlnotes/nightshift/classNames"
import { DATA_TABLE_ELEMENTS } from "@/components/table/DataTable"
import { TABLE_HEAD_CLASS } from "@/lib/styleClasses"

// the columns a narrow container leaves to a row's expanded details
const WIDE_COLUMN_KEYS = ["source", "published"]

// the key of the column that holds a row's controls, whose heading only a screen reader reads
const CONTROLS_COLUMN_KEY = "controls"

/**
 * The controls column's heading, and a width that fits a row's expand button.
 */
export const MCP_VIEW_CONTROLS_COLUMN = { key: CONTROLS_COLUMN_KEY, label: "Actions", width: 52 }

/**
 * The sort of an MCP view's table, whose rows keep the order the tool returned them in.
 */
export const UNSORTED_MCP_VIEW_TABLE_SORT: RowSort = { sortKey: null, isDescending: false, toggleSort: () => {} }

/**
 * The table elements of an MCP view. A wide container shows a table with a fixed layout, so long text wraps, and a narrow
 * one keeps each row's title beside its controls and leaves the wide columns out.
 */
export const MCP_VIEW_TABLE_ELEMENTS: DataTableElements = {
	...DATA_TABLE_ELEMENTS,
	Table: ({ children, columns }) => (
		<table className="w-full table-fixed text-left text-sm @max-md:block">
			<colgroup>
				{columns.map((column) => (
					<col key={column.key} style={column.width ? { width: column.width } : undefined} />
				))}
			</colgroup>
			{children}
		</table>
	),
	Head: ({ children }) => <thead className={cn(TABLE_HEAD_CLASS, "@max-md:hidden")}>{children}</thead>,
	Body: ({ children }) => <tbody className="@max-md:block">{children}</tbody>,
	Row: ({ children, hasSeparator, className }) => (
		<tr className={cn("@max-md:flex", hasSeparator && "border-b", className)}>{children}</tr>
	),
	Cell: ({ children, column }) => (
		<td
			className={cn(
				"py-2 pr-2 align-top @max-md:block",
				column === CONTROLS_COLUMN_KEY ? "@max-md:shrink-0 @max-md:pr-0" : "@max-md:min-w-0 @max-md:flex-1",
				WIDE_COLUMN_KEYS.includes(column) && "@max-md:hidden",
			)}
		>
			{children}
		</td>
	),
	Details: ({ children, columnCount, hasSeparator }) => (
		<tr className={cn("@max-md:block", hasSeparator && "border-b")}>
			<td colSpan={columnCount} className="py-2 @max-md:block">
				{children}
			</td>
		</tr>
	),
	Header: ({ column }) => (
		<th className={cn("py-2 pr-2 font-normal", column.key === CONTROLS_COLUMN_KEY && "sr-only")}>{column.label}</th>
	),
}

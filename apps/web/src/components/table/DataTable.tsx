import type { DataTableElements } from "@carlnotes/core/components/DataTable"
import { cn } from "@carlnotes/nightshift/classNames"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { SortableHeader } from "./SortableHeader"

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
	Details: ({ children, columnCount }) => (
		<tr className="border-b">
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

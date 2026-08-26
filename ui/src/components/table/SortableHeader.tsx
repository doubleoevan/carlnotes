import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { useState } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

// a table column's sort value. numbers compare numerically, strings case-insensitively, and null sorts last
export type SortValue = string | number | null

// the sort state a SortableHeader needs from the hook
type RowSort = {
	sortKey: string | null
	isDescending: boolean
	toggleSort: (key: string) => void
}

// order two sort values ascending, nulls after every real value
function compareValues(first: SortValue, second: SortValue): number {
	// a null cell sorts below any value
	if (first === null) {
		return second === null ? 0 : 1
	}
	if (second === null) {
		return -1
	}
	// numeric columns compare as numbers, everything else as case-insensitive text
	if (typeof first === "number" && typeof second === "number") {
		return first - second
	}
	return String(first).localeCompare(String(second), undefined, { sensitivity: "base" })
}

/**
 * A copy of the rows ordered by one column's value, nulls last in either direction.
 */
export function toSortedRows<Row>(rows: Row[], valueOfRow: (row: Row) => SortValue, isDescending: boolean): Row[] {
	return [...rows].sort((first, second) => {
		const left = valueOfRow(first)
		const right = valueOfRow(second)
		// a null on either side keeps its fixed last place regardless of direction
		if (left === null || right === null) {
			return compareValues(left, right)
		}
		return isDescending ? compareValues(right, left) : compareValues(left, right)
	})
}

/**
 * Column sorting over already-loaded rows: the ordered rows plus the header state.
 */
// initialSort seeds a starting column for a table whose server order isn't stable across reloads
export function useRowSort<Row>(
	rows: Row[],
	valueByKey: Record<string, (row: Row) => SortValue>,
	initialSort?: { key: string; isDescending?: boolean },
): RowSort & { sortedRows: Row[] } {
	const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? null)
	const [isDescending, setIsDescending] = useState(initialSort?.isDescending ?? false)

	// clicking a new column sorts ascending, clicking the active column flips the direction
	function toggleSort(key: string): void {
		setIsDescending(key === sortKey ? !isDescending : false)
		setSortKey(key)
	}

	// an unsorted table keeps the server's order
	const valueOfRow = sortKey ? valueByKey[sortKey] : null
	const sortedRows = valueOfRow ? toSortedRows(rows, valueOfRow, isDescending) : rows
	return { sortedRows, sortKey, isDescending, toggleSort }
}

/**
 * A clickable column header that drives the sort. an arrow on the active column, a faint hint on the rest.
 */
export function SortableHeader({
	sort,
	sortKey,
	label,
	tooltip,
	className,
}: {
	sort: RowSort
	sortKey: string
	label: string
	tooltip?: string
	className?: string
}) {
	const isActive = sort.sortKey === sortKey
	// the header button, optionally wrapped in a tooltip explaining the shortened label
	const headerButton = (
		<button
			type="button"
			onClick={() => sort.toggleSort(sortKey)}
			className="hover:text-foreground inline-flex items-center gap-1"
		>
			{label}
			{isActive ? (
				sort.isDescending ? (
					<ArrowDown className="size-3" />
				) : (
					<ArrowUp className="size-3" />
				)
			) : (
				<ChevronsUpDown className="size-3 opacity-40" />
			)}
		</button>
	)
	return (
		<th className={className}>
			{tooltip ? (
				<Tooltip>
					<TooltipTrigger asChild>{headerButton}</TooltipTrigger>
					<TooltipContent>{tooltip}</TooltipContent>
				</Tooltip>
			) : (
				headerButton
			)}
		</th>
	)
}

import { useState } from "react"

// a table column's sort value. numbers compare numerically, strings case-insensitively, and null sorts last
export type SortValue = string | number | null

// the sort state a SortableHeader needs from the hook
export type RowSort = {
	sortKey: string | null
	isDescending: boolean
	toggleSort: (key: string) => void
}

// tables share their rows, column values, and optional starting order
export type RowSortOptions<Row> = {
	rows: Row[]
	valueByKey: Record<string, (row: Row) => SortValue>
	initialSort?: { key: string; isDescending?: boolean }
}

/**
 * Returns a copy of the rows ordered by one column's value, nulls last in either direction.
 */
export function toSortedRows<Row>({
	rows,
	valueOfRow,
	isDescending,
}: {
	rows: Row[]
	valueOfRow: (row: Row) => SortValue
	isDescending: boolean
}): Row[] {
	return [...rows].sort((first, second) => {
		// read the two column values
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
 * Sorts loaded rows and returns the selected column and direction.
 */
export function useRowSort<Row>({
	rows,
	valueByKey,
	initialSort,
}: RowSortOptions<Row>): RowSort & { sortedRows: Row[] } {
	// retain the selected column and direction
	const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? null)
	const [isDescending, setIsDescending] = useState(initialSort?.isDescending ?? false)

	// start a new column ascending or reverse the selected column
	function toggleSort(key: string): void {
		setIsDescending(key === sortKey ? !isDescending : false)
		setSortKey(key)
	}

	// an unsorted table keeps the server's order
	const valueOfRow = sortKey ? valueByKey[sortKey] : null
	const sortedRows = valueOfRow ? toSortedRows({ rows, valueOfRow, isDescending }) : rows
	return { sortedRows, sortKey, isDescending, toggleSort }
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

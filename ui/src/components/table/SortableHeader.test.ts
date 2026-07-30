import { describe, expect, it } from "bun:test"
import { toSortedRows } from "./SortableHeader"

// rows carrying one sortable field, as the table accessors produce
const byValue = (row: { value: string | number | null }): string | number | null => row.value

describe("toSortedRows", () => {
	it("orders numbers ascending and flips them descending", () => {
		const rows = [{ value: 20 }, { value: 5 }, { value: 100 }]
		expect(toSortedRows(rows, byValue, false).map(byValue)).toEqual([5, 20, 100])
		expect(toSortedRows(rows, byValue, true).map(byValue)).toEqual([100, 20, 5])
	})

	it("orders text case-insensitively", () => {
		const rows = [{ value: "banana" }, { value: "Apple" }, { value: "cherry" }]
		expect(toSortedRows(rows, byValue, false).map(byValue)).toEqual(["Apple", "banana", "cherry"])
	})

	it("orders iso date strings chronologically", () => {
		const rows = [{ value: "2026-07-12T09:00:00.000Z" }, { value: "2025-12-31T23:59:59.000Z" }]
		expect(toSortedRows(rows, byValue, false).map(byValue)).toEqual([
			"2025-12-31T23:59:59.000Z",
			"2026-07-12T09:00:00.000Z",
		])
	})

	it("keeps null cells last in either direction", () => {
		const rows = [{ value: null }, { value: 3 }, { value: null }, { value: 7 }]
		expect(toSortedRows(rows, byValue, false).map(byValue)).toEqual([3, 7, null, null])
		expect(toSortedRows(rows, byValue, true).map(byValue)).toEqual([7, 3, null, null])
	})

	it("copies rather than mutates the given rows", () => {
		const rows = [{ value: 2 }, { value: 1 }]
		toSortedRows(rows, byValue, false)
		expect(rows.map(byValue)).toEqual([2, 1])
	})
})

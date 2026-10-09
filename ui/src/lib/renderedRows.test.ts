// a paged list renders the page's rows and its first fifty, hiding a row off the page with JavaScript
import { expect, test } from "bun:test"
import { NO_SCRIPT_ROW_LIMIT } from "@shared/seo"
import { toRenderedRows } from "./renderedRows"

// sixty rows, more than the html holds
const rows = [...Array(60).keys()]

test("toRenderedRows renders the first page shown and the rest of the first fifty hidden", () => {
	const renderedRows = toRenderedRows(rows, { pageNumber: 1, pageSize: 5 })
	expect(renderedRows.map(({ row }) => row)).toEqual(rows.slice(0, NO_SCRIPT_ROW_LIMIT))
	expect(renderedRows[0]).toEqual({ row: 0, className: "scripted:after:hidden" })
	expect(renderedRows.slice(1, 5).every(({ className }) => className === "")).toBe(true)
	expect(renderedRows.slice(5).every(({ className }) => className === "scripted:hidden")).toBe(true)
})

// a page past the first fifty renders after them, and its first row drops the separator the hidden row above it leaves
test("toRenderedRows renders a page past the first fifty after them", () => {
	const renderedRows = toRenderedRows(rows, { pageNumber: 12, pageSize: 5 })
	expect(renderedRows.map(({ row }) => row)).toEqual([...rows.slice(0, NO_SCRIPT_ROW_LIMIT), 55, 56, 57, 58, 59])
	expect(renderedRows[49]).toEqual({ row: 49, className: "scripted:hidden" })
	expect(renderedRows[50]).toEqual({ row: 55, className: "scripted:after:hidden" })
})

// a short list renders whole, with the first page's rows hidden and the second page shown
test("toRenderedRows renders a short list whole", () => {
	const renderedRows = toRenderedRows([1, 2, 3, 4, 5, 6, 7], { pageNumber: 2, pageSize: 5 })
	expect(renderedRows.map(({ row, className }) => `${row}${className && `:${className}`}`)).toEqual([
		"1:scripted:hidden",
		"2:scripted:hidden",
		"3:scripted:hidden",
		"4:scripted:hidden",
		"5:scripted:hidden",
		"6:scripted:after:hidden",
		"7",
	])
})

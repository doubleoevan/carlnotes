import { afterEach, expect, test } from "bun:test"
import { TEST_NOTES } from "@carlnotes/contracts/noteTestFixtures"
import type { SourceResult } from "@carlnotes/contracts/topics"
import type { Rating } from "@carlnotes/core/components/RatingThumbs"
import { act, useState } from "react"
import { NotesTable } from "@/components/note/NotesTable"
import { TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { renderTestHook } from "@/lib/hookTestHarness"
import { Pagination } from "./Pagination"
import { RatingThumbs } from "./RatingThumbs"
import { SourceResultsChart } from "./SourceResultsChart"

// restore the browser environment even when an interaction fails
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
})

test("table pagination keeps its select mounted and resets to the first page on size or sort changes", async () => {
	// render the actual web adapter over the shared state and composition
	const rows = Array.from({ length: 23 }, (_, index) => ({ name: String(index).padStart(2, "0") }))
	const harness = await renderTestHook(
		() => usePaginatedRowSort({ rows: rows, valueByKey: { name: (row) => row.name }, ...{ initialPageSize: 5 } }),
		({ pagination }) => <TablePagination {...pagination} />,
	)
	cleanups.push(harness.close)
	const select = getElement<HTMLSelectElement>(harness.container, "select")
	const previous = getElement<HTMLButtonElement>(harness.container, '[aria-label="Previous page"]')
	const next = getElement<HTMLButtonElement>(harness.container, '[aria-label="Next page"]')
	expect(previous.disabled).toBe(true)
	await act(async () => next.click())
	expect(harness.container.textContent).toContain("Page 2 of 5")
	expect(previous.disabled).toBe(false)

	// changing size preserves the focused select and starts the new page size at the top
	select.focus()
	select.value = "10"
	await act(async () => select.dispatchEvent(new window.Event("change", { bubbles: true })))
	expect(harness.container.querySelector("select")).toBe(select)
	expect(document.activeElement).toBe(select)
	expect(harness.container.textContent).toContain("Page 1 of 3")
	expect(harness.read().pageRows).toHaveLength(10)
	await act(async () => next.click())
	await act(async () => harness.read().sort.toggleSort("name"))
	expect(harness.read().pagination.page).toBe(0)

	// a large page keeps only the size control, while shrinking the data removes the footer
	select.value = "50"
	await act(async () => select.dispatchEvent(new window.Event("change", { bubbles: true })))
	expect(harness.container.querySelector('[aria-label="Next page"]')).toBeNull()
	await harness.render(() => usePaginatedRowSort({ rows: rows.slice(0, 5), valueByKey: { name: (row) => row.name } }))
	expect(harness.container.textContent).toBe("")
})

test("numbered pagination retains the clicked button and adjusts scroll by the changed list height", async () => {
	// keep the next control alive so the web adapter can measure it after the new rows render
	let controlTop = 500
	const harness = await renderTestHook(
		() => useState(1),
		([pageNumber, setPageNumber]) => (
			<Pagination
				ariaLabel="Brew diary"
				pageNumber={pageNumber}
				pageCount={8}
				onOpenPage={(page) => {
					controlTop = 320
					setPageNumber(page)
				}}
			/>
		),
	)
	cleanups.push(harness.close)
	const scrollOffsets: number[] = []
	window.scrollBy = (options?: ScrollToOptions | number, y?: number): void => {
		scrollOffsets.push(typeof options === "number" ? (y ?? 0) : (options?.top ?? 0))
	}
	const next = getElement<HTMLButtonElement>(harness.container, 'button:has([aria-label="Next page"])')
	next.getBoundingClientRect = () => ({ top: controlTop }) as DOMRect
	next.focus()
	await act(async () => next.click())

	// shared rendering must not remount the node whose focus and position the browser preserves
	expect(harness.read()[0]).toBe(2)
	expect(getElement(harness.container, 'button:has([aria-label="Next page"])')).toBe(next)
	expect(document.activeElement).toBe(next)
	expect(scrollOffsets).toEqual([-180])
	expect(harness.container.querySelector('[aria-current="page"]')?.textContent).toBe("2")
})

test("Source footnotes opens one detail at a time and collapses an open row without remounting its trigger", async () => {
	// use real Source rows and web controls to exercise the shared disclosure state
	const sourceResults: SourceResult[] = ["first", "second"].map((sourceId) => ({
		sourceId,
		sourceKind: "search",
		label: sourceId,
		status: "ok",
		foundCount: 12,
		keptCount: 4,
		costDollars: null,
		durationMs: 3000,
	}))
	const harness = await renderTestHook(
		() => null,
		() => (
			<SourceResultsChart
				sourceResults={sourceResults}
				scannedAt="2026-10-22T12:00:00Z"
				earlierKeptCount={0}
				earlierFoundCount={0}
			/>
		),
	)
	cleanups.push(harness.close)
	const first = getElement<HTMLButtonElement>(harness.container, "li:nth-child(1) button[aria-expanded]")
	const second = getElement<HTMLButtonElement>(harness.container, "li:nth-child(2) button[aria-expanded]")
	await act(async () => first.click())
	expect(first.getAttribute("aria-expanded")).toBe("true")
	expect(harness.container.textContent).toContain("read 12 · kept 4 · time 3.0s")
	await act(async () => second.click())
	expect(first.getAttribute("aria-expanded")).toBe("false")
	expect(second.getAttribute("aria-expanded")).toBe("true")
	await act(async () => second.click())
	expect(second.getAttribute("aria-expanded")).toBe("false")
	expect(harness.container.textContent).not.toContain("time 3.0s")
})

test("rating controls retain focus while switching and clearing a rating", async () => {
	// exercise the shared toggle through the real web buttons
	const harness = await renderTestHook(
		() => useState<Rating>(null),
		([rating, setRating]) => <RatingThumbs rating={rating} onRate={setRating} />,
	)
	cleanups.push(harness.close)
	const up = getElement<HTMLButtonElement>(harness.container, '[aria-label="Thumbs up"]')
	const down = getElement<HTMLButtonElement>(harness.container, '[aria-label="Thumbs down"]')
	up.focus()
	await act(async () => up.click())
	expect(harness.read()[0]).toBe("up")
	expect(document.activeElement).toBe(up)
	await act(async () => down.click())
	expect(harness.read()[0]).toBe("down")
	expect(up.getAttribute("aria-pressed")).toBe("false")
	await act(async () => down.click())
	expect(harness.read()[0]).toBeNull()
})

test("notes share all columns and totals while sorting and changing page size", async () => {
	// verify semantic table structure and the callbacks that open notes
	const openedNotes: string[] = []
	const harness = await renderTestHook(
		() => null,
		() => <NotesTable notes={TEST_NOTES} onOpenNote={(note) => openedNotes.push(note.id)} />,
	)
	cleanups.push(harness.close)
	expect(Array.from(harness.container.querySelectorAll("thead th")).map((cell) => cell.textContent)).toEqual([
		"Note",
		"Visibility",
		"Updated",
	])
	expect(harness.container.querySelector("tfoot")?.textContent).toContain("12 notes4 private · 4 team · 4 public")
	const firstNote = getElement<HTMLButtonElement>(harness.container, "tbody tr button")
	await act(async () => firstNote.click())
	expect(openedNotes).toEqual([TEST_NOTES[0]?.id ?? ""])

	// sorting after a page change returns to the first page without losing the size control
	const next = getElement<HTMLButtonElement>(harness.container, '[aria-label="Next page"]')
	await act(async () => next.click())
	expect(harness.container.textContent).toContain("Page 2 of 2")
	const visibility = getElement<HTMLButtonElement>(harness.container, "thead th:nth-child(2) button")
	await act(async () => visibility.click())
	expect(harness.container.textContent).toContain("Page 1 of 2")
	const select = getElement<HTMLSelectElement>(harness.container, "select")
	select.value = "5"
	await act(async () => select.dispatchEvent(new window.Event("change", { bubbles: true })))
	expect(harness.container.textContent).toContain("Page 1 of 3")
})

// missing controls fail with their selector instead of weakening the assertions with optional calls
function getElement<ElementType extends Element>(container: HTMLElement, selector: string): ElementType {
	const element = container.querySelector<ElementType>(selector)
	if (!element) {
		throw new Error(`Missing control: ${selector}`)
	}
	return element
}

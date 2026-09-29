// the row of page links shows every page of a short list, and the first, current, and last page of a long one
import { expect, test } from "bun:test"
import { toPaginationSlots } from "./paginationSlots"

test("toPaginationSlots shows every page of a short list", () => {
	expect(toPaginationSlots({ pageNumber: 1, pageCount: 1 })).toEqual([1])
	expect(toPaginationSlots({ pageNumber: 2, pageCount: 3 })).toEqual([1, 2, 3])
	expect(toPaginationSlots({ pageNumber: 4, pageCount: 5 })).toEqual([1, 2, 3, 4, 5])
})

// a long list shows the first, current, and last page, with the neighbors of an end page filling in
test("toPaginationSlots keeps a long list to five slots around the current page", () => {
	expect(toPaginationSlots({ pageNumber: 1, pageCount: 20 })).toEqual([1, 2, 3, "gap-before-last", 20])
	expect(toPaginationSlots({ pageNumber: 3, pageCount: 20 })).toEqual([1, 2, 3, "gap-before-last", 20])
	expect(toPaginationSlots({ pageNumber: 4, pageCount: 20 })).toEqual([1, "gap-after-first", 4, "gap-before-last", 20])
	expect(toPaginationSlots({ pageNumber: 10, pageCount: 20 })).toEqual([
		1,
		"gap-after-first",
		10,
		"gap-before-last",
		20,
	])
	expect(toPaginationSlots({ pageNumber: 18, pageCount: 20 })).toEqual([1, "gap-after-first", 18, 19, 20])
	expect(toPaginationSlots({ pageNumber: 20, pageCount: 20 })).toEqual([1, "gap-after-first", 18, 19, 20])
})

// clicking any page in any row keeps that page in the slot it was clicked in,
// and every row is as long as the page count allows
test("toPaginationSlots keeps a clicked page in the slot it was clicked in", () => {
	for (let pageCount = 1; pageCount <= 40; pageCount += 1) {
		for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
			const paginationSlots = toPaginationSlots({ pageNumber, pageCount })
			// the row is as long as the page count allows and shows the current page
			expect(paginationSlots).toHaveLength(Math.min(pageCount, 5))
			expect(paginationSlots).toContain(pageNumber)
			// clicking any page in the row keeps that page in the same slot
			for (const clickedPageNumber of paginationSlots.filter((paginationSlot) => typeof paginationSlot === "number")) {
				expect(toPaginationSlots({ pageNumber: clickedPageNumber, pageCount }).indexOf(clickedPageNumber)).toBe(
					paginationSlots.indexOf(clickedPageNumber),
				)
			}
		}
	}
})

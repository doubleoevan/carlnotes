// tests for the max-results filter that closes every Scan
import { expect, test } from "bun:test"
import { findingIdsToFilter } from "./index"

// a finding row with just the fields that findingIdsToFilter reads. foundAt is a day offset, so a larger one is the newer finding
function findingRow(
	id: string,
	relevanceScore: number,
	isBookmarked = false,
	foundAt = 0,
): { id: string; relevanceScore: number; createdAt: Date; isBookmarked: boolean } {
	return { id, relevanceScore, createdAt: new Date(2026, 0, 1 + foundAt), isBookmarked }
}

// under the cap nothing filters. over it the lowest-ranked unbookmarked findings go
test("findingIdsToFilter keeps the top maxResults by relevance", () => {
	// three rows under a limit of five keep everything
	expect(findingIdsToFilter([findingRow("a", 0.9), findingRow("b", 0.5), findingRow("c", 0.7)], 5)).toEqual([])
	// a limit of two drops the lowest-ranked row
	expect(findingIdsToFilter([findingRow("a", 0.9), findingRow("b", 0.5), findingRow("c", 0.7)], 2)).toEqual(["b"])
})

// bookmarked rows never get filtered and never consume a limit slot
test("findingIdsToFilter spares bookmarked rows past the limit", () => {
	// the bookmarked low scorer survives while the unbookmarked one past the limit goes
	const rows = [findingRow("a", 0.9), findingRow("b", 0.1, true), findingRow("c", 0.7), findingRow("d", 0.3)]
	expect(findingIdsToFilter(rows, 2)).toEqual(["d"])
})

// a scorer that gives many findings the same top score would otherwise let the first arrivals hold every slot
test("findingIdsToFilter gives a tie to the newer finding", () => {
	const rows = [findingRow("old", 1, false, 0), findingRow("new", 1, false, 5)]
	expect(findingIdsToFilter(rows, 1)).toEqual(["old"])

	// the incoming order must not decide it either
	expect(findingIdsToFilter([...rows].reverse(), 1)).toEqual(["old"])
})

// a lower-scored newer finding still loses to a higher-scored older one, so that recency only settles ties
test("findingIdsToFilter puts score ahead of recency", () => {
	const rows = [findingRow("better", 0.9, false, 0), findingRow("newer", 0.4, false, 5)]
	expect(findingIdsToFilter(rows, 1)).toEqual(["newer"])
})

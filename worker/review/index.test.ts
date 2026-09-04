// tests for the max-results filter that closes every Scan
import { expect, test } from "bun:test"
import { findingIdsToFilter } from "./index"

// a topic finding row with just the fields that findingIdsToFilter reads. the caller folds a bookmark and a
// rating into the one flag the filter reads
function findingRow(
	id: string,
	relevanceScore: number,
	isBookmarkedOrRated = false,
	foundAt = 0,
): { id: string; relevanceScore: number; createdAt: Date; isBookmarkedOrRated: boolean } {
	return { id, relevanceScore, createdAt: new Date(2026, 0, 1 + foundAt), isBookmarkedOrRated }
}

// under the limit nothing filters. over it the lowest-ranked findings no user bookmarked or rated go
test("findingIdsToFilter keeps the top maxResults by relevance", () => {
	// three rows under a limit of five keep everything
	expect(findingIdsToFilter([findingRow("a", 0.9), findingRow("b", 0.5), findingRow("c", 0.7)], 5)).toEqual([])
	// a limit of two drops the lowest-ranked row
	expect(findingIdsToFilter([findingRow("a", 0.9), findingRow("b", 0.5), findingRow("c", 0.7)], 2)).toEqual(["b"])
})

// a row a user bookmarked or rated never gets filtered and never consumes a limit slot
test("findingIdsToFilter spares bookmarked and rated rows past the limit", () => {
	// the bookmarked low scorer survives, and the lowest row with neither bookmark nor rating goes instead
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

// an edited prompt can re-score a finding lower than it was, and filtering by score alone would delete it
// and cascade away the rating, read state, and feedback on it
test("findingIdsToFilter spares a finding a user rated after a re-score lowered it", () => {
	// the rated finding was re-scored to the bottom of the ranking and still survives the filter
	const rows = [findingRow("kept-a", 0.9), findingRow("kept-b", 0.8), findingRow("rated", 0.05, true)]
	expect(findingIdsToFilter(rows, 2)).toEqual([])

	// a finding with no bookmark or rating re-scored just as low is the one that goes
	const withUnrated = [...rows, findingRow("unrated", 0.04)]
	expect(findingIdsToFilter(withUnrated, 2)).toEqual(["unrated"])
})

// review orchestration tests for the max-results filter that closes every Scan
import { expect, test } from "bun:test"
import { findingIdsToFilter } from "./index"

// a finding row with just the fields that findingIdsToPrune reads
function findingRow(
	id: string,
	relevanceScore: number,
	isBookmarked = false,
): { id: string; relevanceScore: number; isBookmarked: boolean } {
	return { id, relevanceScore, isBookmarked }
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

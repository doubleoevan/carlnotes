// tests for the max-results filter that closes every Scan: which Findings it removes, the filtered finding each one
// leaves, and the open places that a Scan fills from the pages filtered before
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { resources } from "@carlnotes/db/schema/scans"
import type { FilteredResource } from "./filteredFindings"
import { filterTopicFindings, findingIdsToFilter, loadFilteredResourcesInsideLimit } from "./maxTopicFindings"
import * as reactionSignals from "./reactionSignals"
import * as scoreExamplePages from "./scoreExamplePages"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a topic finding row with just the fields that findingIdsToFilter reads. the caller folds a bookmark and a
// rating into the one flag the filter reads
function findingRow(
	id: string,
	relevanceScore: number,
	isExempt = false,
	foundAt = 0,
): { id: string; relevanceScore: number; createdAt: Date; isExempt: boolean } {
	return { id, relevanceScore, createdAt: new Date(2026, 0, 1 + foundAt), isExempt }
}

// under the limit nothing filters. over it the lowest-ranked findings no user bookmarked or rated go
test("findingIdsToFilter keeps the top maxTopicFindings by relevance", () => {
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

// a Finding as the limit reads it: its id, score, time, url, whether it is exempt, its Resource, the two hashes it was
// reviewed against, and its bonus
function toTopicFindingRow(
	id: string,
	relevanceScore: number,
	{ isExempt = false, reviewedContextHash = "context-1" as string | null } = {},
): unknown[] {
	return [
		...[id, relevanceScore, new Date(2026, 0, 2), `https://example.com/${id}`, isExempt],
		...[`resource-${id}`, reviewedContextHash, `content-${id}`, 0],
	]
}

// stub the Topic's limit and its Findings, with nobody's bookmark or Comment, and return the queries sent
function stubTopicFindings(maxTopicFindings: number, topicFindingRows: unknown[][]): SentQuery[] {
	spyOn(scoreExamplePages, "loadBookmarkedFindingRows").mockResolvedValue([])
	spyOn(reactionSignals, "loadFindingIdsWithComments").mockResolvedValue([])

	// the Topic's limit, then its Findings
	return stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [[maxTopicFindings, "owner-1", null]]
		}
		return text.startsWith("select") && text.includes('from "findings"') ? topicFindingRows : []
	})
}

test("the filter leaves a filtered finding for each Finding it removes, before it deletes them", async () => {
	// a Topic that keeps two of four Findings. the lowest was written before the hash and has no context hash
	const sentQueries = stubTopicFindings(2, [
		toTopicFindingRow("a", 0.9),
		toTopicFindingRow("b", 0.5),
		toTopicFindingRow("c", 0.7),
		toTopicFindingRow("d", 0.3, { reviewedContextHash: null }),
	])
	const filterResult = await filterTopicFindings("topic-1")
	expect(filterResult.filteredFindingCount).toBe(2)
	expect([...filterResult.keptFindingUrls]).toEqual(["https://example.com/a", "https://example.com/c"])

	// the row holds the Topic, the Resource, the two hashes, the score, and the bonus, and no text
	const writes = sentQueries.filter((sentQuery) => !sentQuery.text.startsWith("select"))
	const [filteredFindingInsert, findingDelete] = writes
	expect(writes).toHaveLength(2)
	expect(filteredFindingInsert?.text).toStartWith(
		'insert into "filtered_findings" ("topic_id", "resource_id", "reviewed_context_hash", "reviewed_content_hash", "relevance_score", "personal_source_score_bonus", "filtered_at") values ($1, $2, $3, $4, $5, $6, default)',
	)
	expect(filteredFindingInsert?.values).toEqual(["topic-1", "resource-b", "context-1", "content-b", 0.5, 0])

	// a retried review writes over the row that its first attempt left
	expect(filteredFindingInsert?.text).toContain('on conflict ("topic_id","resource_id") do update set')

	// both Findings past the limit are deleted, the one with no context hash without a row
	expect(findingDelete?.text).toStartWith('delete from "findings"')
	expect(findingDelete?.values).toEqual(["b", "d"])
})

test("a Topic within its limit removes nothing and writes nothing", async () => {
	const sentQueries = stubTopicFindings(5, [toTopicFindingRow("a", 0.9), toTopicFindingRow("b", 0.5)])
	expect((await filterTopicFindings("topic-1")).filteredFindingCount).toBe(0)
	expect(sentQueries.every((sentQuery) => sentQuery.text.startsWith("select"))).toBe(true)
})

// a filtered page as the selection read it, by its id and the score it was removed at
function toFilteredResource(id: string, relevanceScore: number): FilteredResource {
	const resource = Object.fromEntries(
		Object.keys(resources).map((columnName) => [columnName, null]),
	) as unknown as FilteredResource["resource"]
	return { resource: { ...resource, id }, relevanceScore }
}

// the ids of the filtered pages that go back to the model, for a Topic's limit and its Findings
async function loadFilteredIdsInsideLimit(
	maxTopicFindings: number,
	topicFindingRows: unknown[][],
	filteredResources: FilteredResource[],
): Promise<string[]> {
	stubTopicFindings(maxTopicFindings, topicFindingRows)
	const filteredResourcesInsideLimit = await loadFilteredResourcesInsideLimit("topic-1", filteredResources)
	return filteredResourcesInsideLimit.map((resource) => resource.id)
}

// the filtered pages of the tests below, best scored first as the selection reads them
const FILTERED_RESOURCES = [
	toFilteredResource("filtered-7", 0.7),
	toFilteredResource("filtered-6", 0.6),
	toFilteredResource("filtered-5", 0.5),
]

test("an open place takes the best filtered page, and a raised limit opens one place for each step", async () => {
	// two Findings on a Topic that keeps three: one place, which the best filtered page takes
	const topicFindingRows = [toTopicFindingRow("a", 0.9), toTopicFindingRow("b", 0.8)]
	expect(await loadFilteredIdsInsideLimit(3, topicFindingRows, FILTERED_RESOURCES)).toEqual(["filtered-7"])

	// a limit raised to four opens a second place, and to ten a place for every filtered page
	expect(await loadFilteredIdsInsideLimit(4, topicFindingRows, FILTERED_RESOURCES)).toEqual([
		"filtered-7",
		"filtered-6",
	])
	expect(await loadFilteredIdsInsideLimit(10, topicFindingRows, FILTERED_RESOURCES)).toEqual([
		"filtered-7",
		"filtered-6",
		"filtered-5",
	])
})

test("a newly exempt Finding opens one place", async () => {
	// a full Topic on which a user bookmarked one kept Finding, which no longer counts toward the limit
	const topicFindingRows = [toTopicFindingRow("a", 0.9), toTopicFindingRow("b", 0.8, { isExempt: true })]
	expect(await loadFilteredIdsInsideLimit(2, topicFindingRows, FILTERED_RESOURCES)).toEqual(["filtered-7"])
})

test("a full Topic judges nothing again, and a tie stays with the kept Finding", async () => {
	// every kept Finding outscores every filtered page
	const topicFindingRows = [toTopicFindingRow("a", 0.9), toTopicFindingRow("b", 0.8)]
	expect(await loadFilteredIdsInsideLimit(2, topicFindingRows, FILTERED_RESOURCES)).toEqual([])

	// the lowest kept Finding scores what the best filtered page does, and keeps its place
	const tiedFindingRows = [toTopicFindingRow("a", 0.9), toTopicFindingRow("b", 0.7)]
	expect(await loadFilteredIdsInsideLimit(2, tiedFindingRows, FILTERED_RESOURCES)).toEqual([])
})

// a re-score can lower a kept Finding below a page that was removed before it
test("a kept Finding that now scores below a filtered page gives that page its place", async () => {
	const topicFindingRows = [toTopicFindingRow("a", 0.9), toTopicFindingRow("b", 0.65)]
	expect(await loadFilteredIdsInsideLimit(2, topicFindingRows, FILTERED_RESOURCES)).toEqual(["filtered-7"])
})

test("no filtered page reads no limit", async () => {
	const sentQueries = stubTopicFindings(2, [])
	expect(await loadFilteredResourcesInsideLimit("topic-1", [])).toEqual([])
	expect(sentQueries).toEqual([])
})

// filtered finding tests through the stubbed pool: the selection skips a page whose row still holds inside its first
// branch and leaves a url Source's page outside it, a filtered page that ranks inside the Topic's limit joins the rows,
// and a row is deleted as its page goes to the model
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { resources } from "@carlnotes/db/schema/scans"
import { loadResourcesToReview } from "./filter"
import { deleteFilteredFindings } from "./filteredFindings"
import * as reactionSignals from "./reactionSignals"
import * as scoreExamplePages from "./scoreExamplePages"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the page that the Scan rediscovered, and a page that one of the Topic's url Sources names
const DISCOVERED_URL = "https://example.com/discovered"
const URL_SOURCE_PAGE_URL = "https://example.com/chosen"

// what the stubbed pool returns to the selection's reads: the filtered pages with their scores, the rows worth scoring,
// and the Topic's limit, with one url Source and no Finding
type SelectionRows = { filteredRows?: unknown[][]; resourceRows?: unknown[][]; maxTopicFindings?: number }

// a Resource's row in its table's column order
function toResourceRow(id: string, url: string): unknown[] {
	return toTableRow(resources, { id, url, kind: "read", createdAt: new Date(), updatedAt: new Date() })
}

// stub the selection's reads, and return the queries it sent
function stubSelectionRows({
	filteredRows = [],
	resourceRows = [],
	maxTopicFindings = 10,
}: SelectionRows): SentQuery[] {
	// nobody bookmarked or commented on a Finding
	spyOn(scoreExamplePages, "loadBookmarkedFindingRows").mockResolvedValue([])
	spyOn(reactionSignals, "loadFindingIdsWithComments").mockResolvedValue([])

	// each read by the table it starts from
	const rowsByRead: [string, unknown[][]][] = [
		['from "sources"', [[{ url: URL_SOURCE_PAGE_URL }]]],
		['from "filtered_findings" inner join "resources"', filteredRows],
		['from "topics"', [[maxTopicFindings, "owner-1", null]]],
		['from "findings" inner join "resources"', []],
		['from "resources"', resourceRows],
	]
	return stubConnectionPool(({ text }) => {
		const fromClause = text.slice(text.indexOf(" from "))
		return rowsByRead.find(([readStart]) => fromClause.startsWith(` ${readStart}`))?.[1] ?? []
	})
}

// the selection for one rediscovered page against one Topic context
function selectResourcesToReview(
	personalSourceScoreBonuses?: Parameters<typeof loadResourcesToReview>[0]["personalSourceScoreBonuses"],
): ReturnType<typeof loadResourcesToReview> {
	return loadResourcesToReview({
		topicId: "topic-1",
		discoveredResources: [{ url: DISCOVERED_URL }] as Parameters<
			typeof loadResourcesToReview
		>[0]["discoveredResources"],
		topicContextHash: "context-1",
		personalSourceScoreBonuses,
	})
}

// the read of the rows worth scoring
function findSelectionRead(sentQueries: SentQuery[]): SentQuery | undefined {
	return sentQueries.find((sentQuery) => sentQuery.text.includes(' from "resources" where '))
}

test("the selection skips a filtered page inside its first branch, and reads a url Source's page whatever its row says", async () => {
	const sentQueries = stubSelectionRows({})
	await selectResourcesToReview()
	const selectionText = findSelectionRead(sentQueries)?.text ?? ""

	// a page is skipped for a Finding that matches or for a filtered finding that holds, in one group
	expect(selectionText).toContain(
		') and "resources"."id" not in (select "filtered_findings"."resource_id" from "filtered_findings" inner join "resources"',
	)

	// the url Source's own page is the other branch, outside that group
	expect(selectionText).toEndWith(' or "resources"."url" in ($13)))')
	expect(findSelectionRead(sentQueries)?.values.at(-1)).toBe(URL_SOURCE_PAGE_URL)
})

test("a filtered finding holds only for the same context, the same content, enough bonus, and no rated chapter", async () => {
	const sentQueries = stubSelectionRows({})
	await selectResourcesToReview()
	const selectionText = findSelectionRead(sentQueries)?.text ?? ""

	// the context hash and the Resource's current content hash, where a missing hash matches a missing hash
	expect(selectionText).toContain('"filtered_findings"."reviewed_context_hash" = $')
	expect(selectionText).toContain(
		'"filtered_findings"."reviewed_content_hash" is not distinct from "resources"."content_hash"',
	)

	// at least the bonus that this Scan requires of the page, and no chapter rating that waits for its next Finding
	expect(selectionText).toContain('"filtered_findings"."personal_source_score_bonus" >= case when')
	expect(selectionText).toContain(
		'not exists (select "episode_chapters"."id" from "episode_chapters" inner join "episodes" on "episode_chapters"."episode_id" = "episodes"."id" where ("episodes"."topic_id" = $',
	)
	expect(selectionText).toContain(
		'"episode_chapters"."resource_id" = "filtered_findings"."resource_id" and "episode_chapters"."rating" is not null',
	)
})

// a sender who deliberately sends a page's link asks for the full bonus, which a row filtered without it lacks
test("a deliberately sent link requires the full bonus of a filtered row", async () => {
	const sentQueries = stubSelectionRows({})
	await selectResourcesToReview(new Map([[DISCOVERED_URL, 0.1]]))
	const selectionRead = findSelectionRead(sentQueries)
	expect(selectionRead?.text).toContain(
		'"filtered_findings"."personal_source_score_bonus" >= case when "resources"."url" in ($',
	)
	expect(selectionRead?.values.filter((value) => value === DISCOVERED_URL).length).toBeGreaterThanOrEqual(3)
})

test("a filtered page that ranks inside the Topic's limit goes back to the model, once", async () => {
	// the Topic keeps ten Findings and has none, so the rediscovered filtered page has a place
	const filteredRows = [[...toResourceRow("filtered-1", DISCOVERED_URL), 0.6]]
	stubSelectionRows({ filteredRows })
	expect((await selectResourcesToReview()).map((resource) => resource.id)).toEqual(["filtered-1"])

	// a url Source's page with a filtered row is already among the rows, and is not sent twice
	restoreConnectionPool()
	stubSelectionRows({ filteredRows, resourceRows: [toResourceRow("filtered-1", DISCOVERED_URL)] })
	expect((await selectResourcesToReview()).map((resource) => resource.id)).toEqual(["filtered-1"])
})

test("a Scan that discovered nothing reads no filtered page and no limit", async () => {
	const sentQueries = stubSelectionRows({})
	await loadResourcesToReview({ topicId: "topic-1", discoveredResources: [], topicContextHash: "context-1" })
	expect(sentQueries).toHaveLength(2)
	expect(sentQueries[0]?.text).toStartWith('select "config" from "sources"')
	expect(sentQueries[1]?.text).toContain(' from "resources" where ')
})

test("a page that goes to the model loses its filtered finding, and no page deletes nothing", async () => {
	const sentQueries = stubConnectionPool()
	await deleteFilteredFindings("topic-1", ["resource-1", "resource-2"])
	expect(sentQueries.map((sentQuery) => sentQuery.text)).toEqual([
		'delete from "filtered_findings" where ("filtered_findings"."topic_id" = $1 and "filtered_findings"."resource_id" in ($2, $3))',
	])
	expect(sentQueries[0]?.values).toEqual(["topic-1", "resource-1", "resource-2"])

	// nothing to delete sends nothing
	sentQueries.length = 0
	await deleteFilteredFindings("topic-1", [])
	expect(sentQueries).toEqual([])
})

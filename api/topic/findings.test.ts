// topic findings tests for filtering, the new count, and the bounded read
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { TopicFinding } from "@shared/contracts"
import * as monitoring from "@shared/monitoring"
import { connectionPool } from "../../db"
import {
	type FindingPageWindow,
	filteredTopicFindings,
	loadTopicFindings,
	newTopicFindingCount,
	TOPIC_FINDINGS_READ_LIMIT,
} from "./findings"

// a topic finding with placeholder fields. the tests only care about isConsumed
function topicFinding(isConsumed: boolean): TopicFinding {
	return {
		// the ids and the resource metadata
		findingId: "f",
		scanId: "s",
		resourceId: "r",
		url: "https://example.com/a",
		resourceKind: "read",
		title: null,
		source: null,
		faviconPath: null,
		publishedAt: null,
		fetchedAt: "2026-01-01T00:00:00.000Z",
		// the topic finding's metadata and the user's isConsumed flag
		viewCount: 0,
		relevanceScore: 0,
		relevanceExplanation: "",
		rating: null,
		engagement: null,
		isConsumed,
		isBookmarked: false,
		teamBookmarks: [],
	}
}

// the default view hides consumed topic findings. the "All" view shows them
test("filteredTopicFindings hides consumed by default and shows them for the 'All' view", () => {
	// three topic findings, one consumed
	const topicFindings = [topicFinding(false), topicFinding(true), topicFinding(false)]
	// the default view keeps the two unconsumed findings in order, and it filters out the consumed one
	const unconsumedTopicFindings = filteredTopicFindings(topicFindings, false)
	expect(unconsumedTopicFindings[0]).toBe(topicFindings[0])
	expect(unconsumedTopicFindings[1]).toBe(topicFindings[2])
	// the "All" view keeps all three in their original order
	expect(filteredTopicFindings(topicFindings, true)).toEqual(topicFindings)
})

// "# new" counts unconsumed topic findings
test("newTopicFindingCount counts unconsumed topic findings", () => {
	expect(newTopicFindingCount([topicFinding(false), topicFinding(true), topicFinding(false)])).toBe(2)
})

// one row of a visitor's finding read, as the database returns it: the finding, its resource, and the null user columns
function findingRow(index: number): unknown[] {
	const resourceColumns = [`resource-${index}`, `https://example.test/${index}`, "read", `Finding ${index}`]
	const dateColumns = ["2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z"]
	return [`finding-${index}`, "scan-1", ...resourceColumns, ...dateColumns, 0.9, "", 0, null, null, null, null]
}

// a visitor's read of a topic's findings with the pool's query swapped for a stub that returns rowCount rows.
// returns the findings and the values the read sent, and the pool's own query comes back however the read ends
async function readTopicFindingsWithStub(
	rowCount: number,
	pageWindow?: FindingPageWindow,
): Promise<{ topicFindings: TopicFinding[]; sentValues: unknown[] }> {
	const poolQuery = connectionPool.query
	let sentValues: unknown[] = []
	connectionPool.query = ((_queryConfig: unknown, values: unknown[]) => {
		sentValues = values
		return Promise.resolve({ rows: Array.from({ length: rowCount }, (_, index) => findingRow(index)), fields: [] })
	}) as unknown as typeof connectionPool.query

	// read, then put the pool's own query back
	try {
		const topicFindings = await loadTopicFindings({ topicId: "topic-1", userId: null, pageWindow })
		return { topicFindings, sentValues }
	} finally {
		connectionPool.query = poolQuery
	}
}

// put each spy back after each test, whether its assertions pass or not
afterEach(() => {
	mock.restore()
})

// a topic with more findings than the limit reads the limit's worth and sends one warning
test("a topic's finding read stops at the limit and warns", async () => {
	const reportSpy = spyOn(monitoring, "reportThresholdCrossing").mockImplementation(() => true)
	const { topicFindings, sentValues } = await readTopicFindingsWithStub(TOPIC_FINDINGS_READ_LIMIT)

	// the read asks for the limit's worth of rows, and reaching the limit is reported once
	expect(sentValues).toContain(TOPIC_FINDINGS_READ_LIMIT)
	expect(topicFindings.length).toBe(TOPIC_FINDINGS_READ_LIMIT)
	expect(reportSpy).toHaveBeenCalledTimes(1)
	expect(reportSpy.mock.calls[0]?.[0]).toMatchObject({ condition: "topic-findings-read-limit" })
})

// a topic under the limit reads every finding, and nothing is reported
test("a topic under the limit reads whole", async () => {
	const reportSpy = spyOn(monitoring, "reportThresholdCrossing").mockImplementation(() => true)
	const { topicFindings } = await readTopicFindingsWithStub(24)

	expect(topicFindings.map((topicFinding) => topicFinding.findingId)).toEqual(
		Array.from({ length: 24 }, (_, index) => `finding-${index}`),
	)
	expect(reportSpy).not.toHaveBeenCalled()
})

// a page window past the limit reads its own offset and row count, and a full window is not a warning
test("a page window reads past the limit without a warning", async () => {
	const reportSpy = spyOn(monitoring, "reportThresholdCrossing").mockImplementation(() => true)
	const { topicFindings, sentValues } = await readTopicFindingsWithStub(21, { offset: 1020, rowCount: 21 })

	// the window's offset and row count take the limit's place
	expect(sentValues).toContain(1020)
	expect(sentValues).toContain(21)
	expect(sentValues).not.toContain(TOPIC_FINDINGS_READ_LIMIT)
	expect(topicFindings.length).toBe(21)
	expect(reportSpy).not.toHaveBeenCalled()
})

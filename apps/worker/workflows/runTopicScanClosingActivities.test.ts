// scan closing activity tests: a finished, a stopped, and a failed scan each save their topic's vectors, while a scan
// with no topic saves none, the finish write counts each Source's kept findings and the earlier findings, and a payload
// from an older worker is reviewed and finished as a newer one is
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { StoredSourceResult } from "@carlnotes/contracts/scanSourceResults"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { newBudget } from "@carlnotes/models/budget"
import * as litellm from "@carlnotes/models/litellm"
import type { DiscoveredResource } from "@carlnotes/pipeline/ingest/ingester"
import * as review from "@carlnotes/pipeline/review/index"
import { emptyReviewSummary } from "@carlnotes/pipeline/review/track"
import * as analytics from "@carlnotes/server/analytics"
import { MockActivityEnvironment } from "@temporalio/testing"
import { DefaultLogger } from "@temporalio/worker"
import {
	failScan,
	finishScan,
	type IngestStageResult,
	reviewForScan,
	stopScan,
	toScanSourceResults,
} from "./runTopicScanActivities"

// the connection pool's own query, put back after each test along with the spies
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the scan update returns its topic, and every other query returns no rows
function toScanUpdateRows(sentQuery: SentQuery): unknown[] {
	return sentQuery.text.startsWith('update "scans"') ? [["topic-1"]] : []
}

// the topic vector upsert among the sent queries
function findTopicVectorUpsert(sentQueries: SentQuery[]): SentQuery | undefined {
	return sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "topic_vectors"'))
}

// a review that kept nothing, for a finish that reads its kept findings from the stubbed rows
const EMPTY_REVIEW = {
	keptCount: 0,
	filteredCount: 0,
	earlierFoundCount: 0,
	addedOrFilteredFindingCount: 0,
	scanSummary: "",
	resourceIdsToScore: [],
	scoredResourceIds: [],
}

// an ingest stage result with no Resources, Sources, or results, for each test to override
function toIngestStageResult(overrides: Partial<IngestStageResult> = {}): IngestStageResult {
	return {
		resources: [],
		foundCount: 0,
		status: "succeeded",
		problemSources: [],
		sourceOutcomes: [],
		budget: newBudget(),
		...overrides,
	}
}

// the value an update sent for one column, found by the parameter number its sql names
function toSetValue(sentQuery: SentQuery | undefined, columnName: string): unknown {
	const parameterNumber = sentQuery?.text.match(new RegExp(`"${columnName}" = \\$(\\d+)`))?.[1]
	return parameterNumber === undefined ? undefined : sentQuery?.values[Number(parameterNumber) - 1]
}

// the scan update among the sent queries
function findScanUpdate(sentQueries: SentQuery[]): SentQuery | undefined {
	return sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "scans"'))
}

// one Source's stored result before its kept count is filled in
function toIngestSourceResult(sourceId: string, foundCount: number): StoredSourceResult {
	return {
		sourceId,
		sourceKind: "rss",
		label: sourceId,
		foundCount,
		keptCount: 0,
		costDollars: 0,
		durationMs: 500,
		status: "ok",
	}
}

// one discovered Resource credited to a Source
function toDiscoveredResource(url: string, sourceId: string): DiscoveredResource {
	return { url, kind: "read", isFromCustomSource: true, sourceId }
}

test("a finished scan saves its topic's vectors, whatever its status", async () => {
	// the finished scan row, and no topic row, so the finish stops after the vectors
	const finishedScanRow = toTableRow(scans, { id: "scan-1", topicId: "topic-1", ownerId: "owner-1", status: "failed" })
	const sentQueries = stubConnectionPool(({ text }) => (text.startsWith('update "scans"') ? [finishedScanRow] : []))

	// a scan whose ingest failed and whose review kept nothing
	const budget = newBudget()
	const ingestResult = toIngestStageResult({ status: "failed", budget })
	await finishScan("scan-1", "topic-1", "owner-1", ingestResult, { review: EMPTY_REVIEW, budget })
	expect(findTopicVectorUpsert(sentQueries)?.values).toContain("topic-1")
})

// a prompt edit re-scores the topic's findings into this scan, so the kept findings no Source returned count as earlier
test("each Source's kept count plus the earlier count equals the kept count", () => {
	// two Sources that found 6 and 4 Resources, and a scan that kept 3 and 2 of them and 30 findings from earlier scans
	const discoveredResources = [
		...Array.from({ length: 6 }, (_, i) => toDiscoveredResource(`https://a.test/${i}`, "source-a")),
		...Array.from({ length: 4 }, (_, i) => toDiscoveredResource(`https://b.test/${i}`, "source-b")),
	]
	const keptFindingUrls = [
		...["https://a.test/0", "https://a.test/1", "https://a.test/2", "https://b.test/0", "https://b.test/3"],
		...Array.from({ length: 30 }, (_, i) => `https://earlier.test/${i}`),
	]
	const scanSourceResults = toScanSourceResults({
		ingestSourceResults: [toIngestSourceResult("source-a", 6), toIngestSourceResult("source-b", 4)],
		discoveredResources,
		keptFindingUrls,
		earlierFoundCount: 30,
	})

	// the Sources kept 3 and 2, the other 30 are earlier, and the parts add up to the kept count
	const sourceKeptCounts = scanSourceResults.sources.map((sourceResult) => sourceResult.keptCount)
	const keptCountSum = sourceKeptCounts.reduce((sum, keptCount) => sum + keptCount, 0)
	expect(sourceKeptCounts).toEqual([3, 2])
	expect(scanSourceResults.earlierKeptCount).toBe(30)
	expect(keptCountSum + scanSourceResults.earlierKeptCount).toBe(keptFindingUrls.length)
	expect(scanSourceResults.earlierFoundCount).toBe(30)

	// a credited url is one of its Source's Resources, so no Source keeps more than it found
	for (const sourceResult of scanSourceResults.sources) {
		expect(sourceResult.keptCount).toBeLessThanOrEqual(sourceResult.foundCount)
	}
})

// the finish reads the kept findings' urls once and writes the kept count and each Source's result in the same update
test("the finish update writes the source results beside the kept count", async () => {
	// the scan kept two findings, one per Source, and has no topic row, so the finish stops after the vectors
	const finishedScanRow = toTableRow(scans, { id: "scan-1", topicId: "topic-1", ownerId: "owner-1" })
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "findings" inner join "resources"')) {
			return [["https://a.test/0"], ["https://b.test/0"]]
		}
		return text.startsWith('update "scans"') ? [finishedScanRow] : []
	})

	// a payload with two Sources, each credited one of the kept urls
	const ingestResult = toIngestStageResult({
		resources: [
			toDiscoveredResource("https://a.test/0", "source-a"),
			toDiscoveredResource("https://b.test/0", "source-b"),
		],
		foundCount: 2,
		sourceResults: [toIngestSourceResult("source-a", 1), toIngestSourceResult("source-b", 1)],
	})
	await finishScan("scan-1", "topic-1", "owner-1", ingestResult, { review: EMPTY_REVIEW, budget: newBudget() })

	// the one update writes the kept count and each Source's kept count
	const scanUpdate = findScanUpdate(sentQueries)
	expect(toSetValue(scanUpdate, "kept_count")).toBe(2)
	expect(JSON.parse(String(toSetValue(scanUpdate, "source_results")))).toEqual({
		sources: [
			{ ...toIngestSourceResult("source-a", 1), keptCount: 1 },
			{ ...toIngestSourceResult("source-b", 1), keptCount: 1 },
		],
		earlierKeptCount: 0,
		earlierFoundCount: 0,
	})
})

// a Scan whose ingest ran on a worker before the smaller result reaches the review and the finish on a newer worker
test("a payload from a worker before the smaller result is reviewed and finished as the smaller one is", async () => {
	// the Scan's row for every read of it, one kept Finding of Source a, and the finished Scan's row
	const scanRow = toTableRow(scans, { id: "scan-1", topicId: "topic-1", ownerId: "owner-1" })
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "findings" inner join "resources"')) {
			return [["https://a.test/0"]]
		}
		return text.includes('from "scans"') || text.startsWith('update "scans"') ? [scanRow] : []
	})

	// the owner's key, and a review that keeps what it was given
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("a-key")
	const reviewScanSpy = spyOn(review, "reviewScan").mockResolvedValue(emptyReviewSummary())

	// the older payload holds each Resource's kind, title, and snippet, and the newer one its url and Source alone
	const wideResource = {
		...toDiscoveredResource("https://a.test/0", "source-a"),
		title: "A page",
		snippet: "a snippet",
	}
	const widePayload = toIngestStageResult({
		resources: [wideResource],
		foundCount: 1,
		sourceResults: [toIngestSourceResult("source-a", 1)],
	})
	const narrowPayload = { ...widePayload, resources: [{ url: "https://a.test/0", sourceId: "source-a" }] }

	// review and finish each payload, and keep the source results that each finish wrote
	const activityEnvironment = new MockActivityEnvironment({}, { logger: new DefaultLogger("ERROR") })
	const finishedSourceResults: unknown[] = []
	for (const ingestResult of [widePayload, narrowPayload]) {
		const reviewResult = await activityEnvironment.run(
			reviewForScan,
			...(["scan-1", "topic-1", "owner-1", ingestResult, newBudget()] as const),
		)
		sentQueries.length = 0
		await finishScan("scan-1", "topic-1", "owner-1", ingestResult, reviewResult as never)
		finishedSourceResults.push(JSON.parse(String(toSetValue(findScanUpdate(sentQueries), "source_results"))))
	}

	// the review was given each payload's Resources, and both finishes credit the kept Finding to its Source
	expect(reviewScanSpy.mock.calls.map((reviewCall) => reviewCall[2])).toEqual([
		widePayload.resources,
		narrowPayload.resources,
	])
	expect(finishedSourceResults[0]).toEqual(finishedSourceResults[1])
	expect(finishedSourceResults[0]).toMatchObject({ sources: [{ sourceId: "source-a", keptCount: 1 }] })
})

// Personal sources links reach the Scan as Findings with a score bonus, and each sender's annotation on them is private
test("a finished scan reports its Personal sources Findings and private annotations", async () => {
	const finishedScanRow = toTableRow(scans, { id: "scan-1", topicId: "topic-1", ownerId: "owner-1", keptCount: 2 })
	const topicRow = toTableRow(topics, { id: "topic-1", visibility: "private" })
	stubConnectionPool(({ text }) => {
		// one kept Finding with a score bonus, and one without
		if (text.includes('from "findings" inner join "resources"')) {
			return [
				["https://a.test/0", 0.1],
				["https://b.test/0", 0],
			]
		}
		// the private annotations that the Scan saved
		if (text.includes('from "finding_personal_annotations"')) {
			return [[3]]
		}

		// the Topic, and the Scan's finished row
		if (text.startsWith("select") && text.includes('from "topics"')) {
			return [topicRow]
		}
		return text.startsWith('update "scans"') ? [finishedScanRow] : []
	})

	// the finish reports the Scan's counts
	const trackEventSpy = spyOn(analytics, "trackEvent")
	await finishScan("scan-1", "topic-1", "owner-1", toIngestStageResult({ foundCount: 2 }), {
		review: EMPTY_REVIEW,
		budget: newBudget(),
	})
	const scanCompleted = trackEventSpy.mock.calls.find(([event]) => event === "scan_completed")
	expect(scanCompleted?.[2]).toMatchObject({ personalFindingsKept: 1, privateAnnotationsSaved: 3 })
})

// the read count is what the Sources returned plus the earlier findings the review read again
test("the finish adds the earlier findings the review read again to the read count", async () => {
	const sentQueries = stubConnectionPool(toScanUpdateRows)
	const ingestResult = toIngestStageResult({
		foundCount: 2,
		sourceResults: [toIngestSourceResult("source-a", 2)],
	})
	await finishScan("scan-1", "topic-1", "owner-1", ingestResult, {
		review: { ...EMPTY_REVIEW, earlierFoundCount: 3 },
		budget: newBudget(),
	})

	// the scan reads 5, and its source results record the 3 earlier reads
	const scanUpdate = findScanUpdate(sentQueries)
	expect(toSetValue(scanUpdate, "found_count")).toBe(5)
	expect(JSON.parse(String(toSetValue(scanUpdate, "source_results"))).earlierFoundCount).toBe(3)
})

// a review from a worker before the earlier read count leaves the read count at what the Sources returned
test("a review payload without the earlier read count reads none", async () => {
	const sentQueries = stubConnectionPool(toScanUpdateRows)
	const { earlierFoundCount: _, ...reviewWithoutEarlierFoundCount } = EMPTY_REVIEW
	await finishScan("scan-1", "topic-1", "owner-1", toIngestStageResult({ foundCount: 2 }), {
		review: reviewWithoutEarlierFoundCount as typeof EMPTY_REVIEW,
		budget: newBudget(),
	})
	expect(toSetValue(findScanUpdate(sentQueries), "found_count")).toBe(2)
})

// a payload from a worker before source results has none to count, so the scan saves with no results
test("a payload without source results writes null", async () => {
	const sentQueries = stubConnectionPool(toScanUpdateRows)
	await finishScan("scan-1", "topic-1", "owner-1", toIngestStageResult(), {
		review: EMPTY_REVIEW,
		budget: newBudget(),
	})
	expect(findScanUpdate(sentQueries)?.text).toContain('"source_results" = $')
	expect(toSetValue(findScanUpdate(sentQueries), "source_results")).toBeNull()
})

// a stopped scan saves its status and times only, so it never writes a kept count or results
test("a stop writes neither the kept count nor the source results", async () => {
	const sentQueries = stubConnectionPool(toScanUpdateRows)
	await stopScan("scan-1")
	expect(findScanUpdate(sentQueries)?.text).not.toContain('"kept_count"')
	expect(findScanUpdate(sentQueries)?.text).not.toContain('"source_results"')
})

test("a stopped scan saves its topic's vectors", async () => {
	const sentQueries = stubConnectionPool(toScanUpdateRows)
	await stopScan("scan-1")
	expect(findTopicVectorUpsert(sentQueries)?.values).toContain("topic-1")
})

test("a failed scan saves its topic's vectors", async () => {
	const sentQueries = stubConnectionPool(toScanUpdateRows)
	await failScan("scan-1", "the review stage threw an error")
	expect(findTopicVectorUpsert(sentQueries)?.values).toContain("topic-1")
})

// a stage that saved more spend before it failed keeps that spend
test("a failed scan never lowers the cost its row already holds", async () => {
	const sentQueries = stubConnectionPool(toScanUpdateRows)
	await failScan("scan-1", "the review stage threw an error", newBudget())
	expect(findScanUpdate(sentQueries)?.text).toContain('"cost" = greatest("scans"."cost", ')
	expect(findScanUpdate(sentQueries)?.text).toContain('"stage_costs" = case when "scans"."cost" > ')
})

test("a scan whose topic was deleted saves no vectors", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => (sentQuery.text.startsWith('update "scans"') ? [[null]] : []))
	await stopScan("scan-1")
	expect(findTopicVectorUpsert(sentQueries)).toBeUndefined()
})

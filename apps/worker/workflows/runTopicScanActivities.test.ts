// scan activity tests: the ingest stage runs no Source for a Scan that is already marked failed and passes on only what
// the later stages read, a finished, a stopped, and a failed scan each save their topic's vectors, while a scan with no
// topic saves none, and the finish write counts each Source's kept findings
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { StoredSourceResult } from "@carlnotes/contracts/topics"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { scans } from "@carlnotes/db/schema/scans"
import { newBudget } from "@carlnotes/models/budget"
import * as litellm from "@carlnotes/models/litellm"
import * as ingest from "@carlnotes/pipeline/ingest/index"
import type { DiscoveredResource } from "@carlnotes/pipeline/ingest/ingester"
import { ApplicationFailure } from "@temporalio/activity"
import {
	failScan,
	finishScan,
	type IngestStageResult,
	ingestForScan,
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

// the ingest stage throws the Scan's own failure reason as a failure that Temporal does not retry
test("a Scan that is already marked failed runs no Source and keeps its failure reason", async () => {
	// a failed scan row with its failure reason, as the connection pool returns the row for every select
	const scanRow = toTableRow(scans, { id: "scan-1", ownerId: "owner-1", status: "failed", error: "the reason" })
	stubConnectionPool(({ text }) => (text.startsWith("select") ? [scanRow] : []))

	// spies on the key load and the Source ingest
	const loadOrProvisionUserLiteLLMKeySpy = spyOn(litellm, "loadOrProvisionUserLiteLLMKey")
	const ingestFromTopicSourcesSpy = spyOn(ingest, "ingestFromTopicSources")
	const thrownFailure = await ingestForScan("scan-1", "topic-1").catch((error: unknown) => error)

	// the failure has the Scan's reason and is not retried, and neither the key load nor a Source ran
	expect(thrownFailure).toBeInstanceOf(ApplicationFailure)
	expect(thrownFailure).toMatchObject({ message: "the reason", nonRetryable: true })
	expect(loadOrProvisionUserLiteLLMKeySpy).not.toHaveBeenCalled()
	expect(ingestFromTopicSourcesSpy).not.toHaveBeenCalled()
})

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

// the ingest payload is stored in the scan's history three times, so it holds only what the later stages read
test("the ingest stage passes on each Source's outcome as only the four fields the scan report reads", async () => {
	// a running scan row, an owner key, and an ingest whose Sources found Resources and fetched a page body
	const scanRow = toTableRow(scans, { id: "scan-1", ownerId: "owner-1", status: "running" })
	stubConnectionPool(({ text }) => (text.startsWith("select") && text.includes('from "scans"') ? [scanRow] : []))
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-owner")
	const fetchedBody = { markdown: "# The page", etag: null, lastModified: null }
	const sourceOutcomes: ingest.SourceOutcome[] = [
		{
			status: "ok",
			sourceId: "source-a",
			sourceKind: "url",
			label: "https://a.test/page",
			durationMs: 800,
			resources: [{ url: "https://a.test/page", kind: "read", title: "The page", fetchedBody }],
			costDollars: 0,
		},
		{
			status: "fallback",
			sourceId: "source-b",
			sourceKind: "reddit",
			label: "r/typescript",
			durationMs: 1_100,
			resources: [],
			costDollars: 0,
			fallbackMode: "reddit-rss",
		},
		{ status: "failed", sourceId: "source-c", sourceKind: "rss", label: "c.test", durationMs: 90, reason: "404" },
		{ status: "skipped", sourceId: "source-d", sourceKind: "url", label: "https://d.test", durationMs: 0 },
	]
	spyOn(ingest, "ingestFromTopicSources").mockResolvedValue({
		sourceOutcomes,
		summary: ingest.toScanSummary(sourceOutcomes),
	})

	// each outcome keeps its kind, status, and detail, the results come with it, and no page body crosses
	const ingestStageResult = await ingestForScan("scan-1", "topic-1")
	expect(ingestStageResult.sourceOutcomes).toEqual([
		{ sourceKind: "url", status: "ok" },
		{ sourceKind: "reddit", status: "fallback", fallbackMode: "reddit-rss" },
		{ sourceKind: "rss", status: "failed", reason: "404" },
		{ sourceKind: "url", status: "skipped" },
	])
	expect(ingestStageResult.sourceResults?.map(({ sourceId }) => sourceId)).toEqual([
		"source-a",
		"source-b",
		"source-c",
		"source-d",
	])
	expect(ingestStageResult.resources).toEqual([
		{ url: "https://a.test/page", kind: "read", title: "The page", isFromCustomSource: true, sourceId: "source-a" },
	])
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

test("a scan whose topic was deleted saves no vectors", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => (sentQuery.text.startsWith('update "scans"') ? [[null]] : []))
	await stopScan("scan-1")
	expect(findTopicVectorUpsert(sentQueries)).toBeUndefined()
})

// scan activity tests: the ingest stage runs no Source for a Scan that is already marked failed, and a finished, a
// stopped, and a failed scan each save their topic's vectors, while a scan with no topic saves none
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { scans } from "@carlnotes/db/schema/scans"
import { newBudget } from "@carlnotes/models/budget"
import * as litellm from "@carlnotes/models/litellm"
import * as ingest from "@carlnotes/pipeline/ingest/index"
import { ApplicationFailure } from "@temporalio/activity"
import { failScan, finishScan, ingestForScan, stopScan } from "./runTopicScanActivities"

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

test("a finished scan saves its topic's vectors, whatever its status", async () => {
	// the finished scan row, and no topic row, so the finish stops after the vectors
	const finishedScanRow = toTableRow(scans, { id: "scan-1", topicId: "topic-1", ownerId: "owner-1", status: "failed" })
	const sentQueries = stubConnectionPool(({ text }) => (text.startsWith('update "scans"') ? [finishedScanRow] : []))

	// a scan whose ingest failed and whose review kept nothing
	const budget = newBudget()
	const ingestResult = {
		resources: [],
		foundCount: 0,
		status: "failed" as const,
		problemSources: [],
		sourceOutcomes: [],
		budget,
	}
	const review = {
		keptCount: 0,
		filteredCount: 0,
		addedOrFilteredFindingCount: 0,
		scanSummary: "",
		resourceIdsToScore: [],
		scoredResourceIds: [],
	}
	await finishScan("scan-1", "topic-1", "owner-1", ingestResult, { review, budget })
	expect(findTopicVectorUpsert(sentQueries)?.values).toContain("topic-1")
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

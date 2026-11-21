// scan stage activity tests: the ingest stage runs no Source for a Scan that is already marked failed and passes on
// only what the later stages read, each review attempt gets its own model call wait deadline, a review that its
// worker's shutdown cancelled fails for a retry while a stopped one returns, and each Scan write clears its Topic's scan
// status copy
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { StoredSourceResult } from "@carlnotes/contracts/scanSourceResults"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { scans } from "@carlnotes/db/schema/scans"
import * as statusReadCaches from "@carlnotes/db/statusReadCaches"
import { newBudget, toCheckpointBudget, toResumedBudget } from "@carlnotes/models/budget"
import * as litellm from "@carlnotes/models/litellm"
import * as ingest from "@carlnotes/pipeline/ingest/index"
import * as meanVectors from "@carlnotes/pipeline/meanVectors"
import * as review from "@carlnotes/pipeline/review/index"
import { emptyReviewSummary } from "@carlnotes/pipeline/review/track"
import { REVIEW_ATTEMPTS, REVIEW_MODEL_CALL_WAIT_DEADLINE_MS } from "@carlnotes/pipeline/stageTimeouts"
import { ApplicationFailure } from "@temporalio/activity"
import { MockActivityEnvironment } from "@temporalio/testing"
import { DefaultLogger } from "@temporalio/worker"
import {
	failScan,
	finishScan,
	type IngestStageResult,
	ingestForScan,
	reviewForScan,
	stopScan,
	toModelCallWaitDeadlineBudget,
} from "./runTopicScanActivities"

// the connection pool's own query, put back after each test along with the spies
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

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

// the ingest payload is stored in the scan's history three times, so it holds only what the later stages read
test("the ingest stage passes on each Source's outcome as only the four fields the scan report reads", async () => {
	// a running scan row, an owner key, and an ingest whose Sources found Resources and fetched a page body
	const scanRow = toTableRow(scans, { id: "scan-1", ownerId: "owner-1", status: "running" })
	const clearStatusReadsSpy = spyOn(statusReadCaches, "clearStatusReads").mockResolvedValue()

	// the progress update returns the Scan's Topic, and each read of the Scan returns its row
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith('update "scans"') && text.includes("returning")) {
			return [["topic-1"]]
		}
		return text.startsWith("select") && text.includes('from "scans"') ? [scanRow] : []
	})

	// the owner's key, and the Sources' outcomes
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

	// the Topic's scan status copy goes after the pickup and again after the progress
	expect(clearStatusReadsSpy.mock.calls).toEqual([
		["scan", "topic-1"],
		["scan", "topic-1"],
	])

	// the Scan's progress saves each Source for a status read, and its results stay unset
	const progressUpdate = sentQueries.find((query) => query.text.includes('"ingest_source_results" ='))
	expect(progressUpdate?.text).not.toContain('"source_results" =')
	const savedProgress = progressUpdate?.values.find(
		(value): value is string => typeof value === "string" && value.includes("source-a"),
	)
	expect(JSON.parse(savedProgress ?? "null").sources.map(({ foundCount }: StoredSourceResult) => foundCount)).toEqual(
		ingestStageResult.sourceResults?.map(({ foundCount }) => foundCount),
	)
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
	// a Resource crosses as its url, its Source, and the flag that is set, with no title, snippet, or body
	expect(ingestStageResult.resources).toEqual([
		{ url: "https://a.test/page", isFromCustomSource: true, sourceId: "source-a" },
	])
})

test("each review attempt gets a fresh model call wait deadline", () => {
	// the first attempt's deadline sits twenty minutes after it starts
	const firstAttemptBudget = toModelCallWaitDeadlineBudget(newBudget())
	expect(firstAttemptBudget.modelCallWaitDeadlineAt).toBeGreaterThanOrEqual(
		Date.now() + REVIEW_MODEL_CALL_WAIT_DEADLINE_MS - 1000,
	)

	// a second attempt resumes from the heartbeat, which drops the deadline, and gets twenty minutes from its own start
	const nowSpy = spyOn(Date, "now").mockReturnValue(Date.now() + 25 * 60 * 1000)
	const resumedBudget = toResumedBudget(toCheckpointBudget(firstAttemptBudget), newBudget())
	const secondAttemptBudget = toModelCallWaitDeadlineBudget(resumedBudget)
	expect(secondAttemptBudget.modelCallWaitDeadlineAt).toBe(Date.now() + REVIEW_MODEL_CALL_WAIT_DEADLINE_MS)
	expect(secondAttemptBudget.modelCallWaitDeadlineAt).toBeGreaterThan(firstAttemptBudget.modelCallWaitDeadlineAt ?? 0)
	nowSpy.mockRestore()
})

// what cancels a review in the middle: Temporal's reason, and the details that say whether the worker is shutting down
type ReviewCancellation = Parameters<MockActivityEnvironment["cancel"]>

// a review activity's run, and what the attempt checkpointed for the next one
type CancelledReview = { reviewRun: ReturnType<typeof reviewForScan>; heartbeats: unknown[] }

// run the review activity for a Scan whose review is cancelled while it scores, and return the run with its heartbeats
function runCancelledReview(...reviewCancellation: ReviewCancellation): CancelledReview {
	// the Scan's row for every read of it, and no Finding
	stubConnectionPool(({ text }) =>
		text.includes('from "scans"') ? [toTableRow(scans, { id: "scan-1", topicId: "topic-1", ownerId: "owner-1" })] : [],
	)
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("a-key")

	// a review that is cancelled in the middle, has spent ten cents, and returns what it has, as the real one does.
	// the environment logs errors alone, so a failed attempt's warning stays out of the test output
	const activityEnvironment = new MockActivityEnvironment({}, { logger: new DefaultLogger("ERROR") })
	spyOn(review, "reviewScan").mockImplementation(async (_scan, _topicId, _resources, _sources, budget) => {
		activityEnvironment.cancel(...reviewCancellation)
		budget.spentDollars = 0.1
		return emptyReviewSummary()
	})

	// collect what the attempt checkpoints for the next one
	const heartbeats: unknown[] = []
	activityEnvironment.on("heartbeat", (heartbeatDetails) => heartbeats.push(heartbeatDetails))
	const ingestResult = { resources: [], sourceOutcomes: [] } as unknown as IngestStageResult
	const reviewRun = activityEnvironment.run(reviewForScan, "scan-1", "topic-1", "owner-1", ingestResult, newBudget())
	return { reviewRun: reviewRun as CancelledReview["reviewRun"], heartbeats }
}

// a deploy shuts the worker down, which aborts the same signal a person's stop does
test("a review that its worker's shutdown cancelled fails for a retry, after it checkpoints its spend", async () => {
	const workerShutdown = { workerShutdown: true } as ReviewCancellation[1]
	const { reviewRun, heartbeats } = runCancelledReview("WORKER_SHUTDOWN", workerShutdown)

	// the attempt fails instead of returning part of its pages, with a failure that Temporal retries
	const failure = await reviewRun.then(
		() => null,
		(error: unknown) => error as ApplicationFailure,
	)
	expect(failure).toBeInstanceOf(ApplicationFailure)
	expect(failure?.message).toBe("the worker shut down during the review")
	expect([failure?.type, failure?.nonRetryable]).toEqual(["WorkerShutdown", false])

	// the next attempt resumes from the ten cents this one spent, and two shutdowns still leave an attempt
	expect(heartbeats.at(-1)).toMatchObject({ spentDollars: 0.1 })
	expect(REVIEW_ATTEMPTS).toBe(3)
})

test("a review that a person's stop cancelled still returns what it scored", async () => {
	const { reviewRun } = runCancelledReview("CANCELLED")
	const reviewResult = await reviewRun
	expect(reviewResult.review).toEqual(emptyReviewSummary())
	expect(reviewResult.budget.spentDollars).toBe(0.1)
})

test("the write that completes a Scan clears its Topic's scan status copy", async () => {
	// the completing update returns the finished Scan, and the Topic is gone afterward
	const clearStatusReadsSpy = spyOn(statusReadCaches, "clearStatusReads").mockResolvedValue()
	spyOn(meanVectors, "saveTopicVectors").mockResolvedValue(true)
	const finishedScanRow = toTableRow(scans, { id: "scan-1", topicId: "topic-1", ownerId: "owner-1" })
	stubConnectionPool(({ text }) => (text.startsWith('update "scans"') ? [finishedScanRow] : []))
	const ingestResult = { resources: [], sourceOutcomes: [], foundCount: 0, status: "succeeded" } as unknown
	await finishScan("scan-1", "topic-1", "owner-1", ingestResult as IngestStageResult, {
		review: emptyReviewSummary(),
		budget: newBudget(),
	})
	expect(clearStatusReadsSpy).toHaveBeenCalledWith("scan", "topic-1")
})

test("a stopped Scan and a failed Scan clear their Topic's scan status copy", async () => {
	// each update returns the Scan's Topic
	const clearStatusReadsSpy = spyOn(statusReadCaches, "clearStatusReads").mockResolvedValue()
	spyOn(meanVectors, "saveTopicVectors").mockResolvedValue(true)
	stubConnectionPool(({ text }) => (text.startsWith('update "scans"') ? [["topic-1"]] : []))
	await stopScan("scan-1")
	await failScan("scan-2", "the reason", newBudget())
	expect(clearStatusReadsSpy.mock.calls).toEqual([
		["scan", "topic-1"],
		["scan", "topic-1"],
	])

	// a Scan that already finished matches no row, so nothing is cleared
	stubConnectionPool()
	await stopScan("scan-1")
	expect(clearStatusReadsSpy).toHaveBeenCalledTimes(2)
})

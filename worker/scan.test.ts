// scan tests: toScanSummary self-checks, what scanTopic does with a Scan row if the workflow start is rejected or fails,
// and which Scan rows failUnstartedScan marks failed
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { connectionPool } from "../db"
import type { scans } from "../db/schema"
import { toScanSummary } from "./ingest"
import type { NewResource } from "./ingest/ingester"
import { failUnstartedScan, scanTopic } from "./scan"
import * as temporalClient from "./temporalClient"

// the connection pool's own query, put back after each test along with the spies
const originalConnectionPoolQuery = connectionPool.query
afterEach(() => {
	connectionPool.query = originalConnectionPoolQuery
	mock.restore()
})

// an open Scan row with only its id set
const OPEN_SCAN = { id: "scan-1" } as typeof scans.$inferSelect

// a query that the stubbed connection pool was sent
type SentQuery = { text: string; values: unknown[] }

// stub the connection pool to return no rows, and return each query that the stub is sent
function stubConnectionPool(): SentQuery[] {
	const sentQueries: SentQuery[] = []
	connectionPool.query = ((queryConfig: { text: string }, values: unknown[]) => {
		sentQueries.push({ text: queryConfig.text, values })
		return Promise.resolve({ rows: [], fields: [], rowCount: 0 })
	}) as unknown as typeof connectionPool.query
	return sentQueries
}

// a start that Temporal rejects as already running keeps an existing row and marks that row dispatched.
// a row that the caller opened is deleted
test("a rejected start keeps an existing Scan row and marks that row dispatched, and deletes a row that the caller opened", async () => {
	// a workflow start that is rejected as already running
	spyOn(temporalClient, "startTopicScanWorkflow").mockResolvedValue({ status: "running" })

	// an existing row gets a dispatchedAt and is never deleted
	const existingRowSentQueries = stubConnectionPool()
	expect(await scanTopic(OPEN_SCAN, "topic-1", "owner-1", "creation", true)).toEqual({ status: "running" })
	expect(existingRowSentQueries).toHaveLength(1)
	expect(existingRowSentQueries[0]?.text).toStartWith('update "scans" set "dispatched_at" = $1')
	expect(existingRowSentQueries[0]?.values).toContain("scan-1")

	// a row that the caller opened is deleted
	const openedRowSentQueries = stubConnectionPool()
	expect(await scanTopic(OPEN_SCAN, "topic-1", "owner-1", "manual")).toEqual({ status: "running" })
	expect(openedRowSentQueries).toHaveLength(1)
	expect(openedRowSentQueries[0]?.text).toStartWith('delete from "scans"')
	expect(openedRowSentQueries[0]?.values).toEqual(["scan-1"])
})

// if the start throws an error, scanTopic keeps an existing row, sends no query, and throws the same error
test("a start that throws an error keeps an existing Scan row and sends no query", async () => {
	spyOn(temporalClient, "startTopicScanWorkflow").mockRejectedValue(new Error("temporal unreachable"))
	const sentQueries = stubConnectionPool()
	await expect(scanTopic(OPEN_SCAN, "topic-1", "owner-1", "creation", true)).rejects.toThrow("temporal unreachable")
	expect(sentQueries).toEqual([])
})

// the update matches only a running Scan that is not manual, never dispatched, and never picked up
test("failUnstartedScan marks failed only a running Scan that is not manual, not dispatched, and not picked up", async () => {
	const sentQueries = stubConnectionPool()
	await failUnstartedScan("scan-1", "the failure reason")

	// one update saves the status, the reason, and the finish time
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toStartWith('update "scans" set "status" = $1, "error" = $2, "finished_at" = $3')

	// the update names each condition of an unstarted Scan
	expect(sentQueries[0]?.text).toContain('"scans"."status" = $')
	expect(sentQueries[0]?.text).toContain('"scans"."is_manual" = $')
	expect(sentQueries[0]?.text).toContain('"scans"."dispatched_at" is null')
	expect(sentQueries[0]?.text).toContain('"scans"."picked_up_at" is null')
	expect(sentQueries[0]?.values).toEqual(
		expect.arrayContaining(["failed", "the failure reason", "scan-1", "running", false]),
	)
})

// a fake Resource with just the url and resource kind
function resource(url: string): NewResource {
	return { url, kind: "read" }
}

// counts dedupe across Sources, cost sums only the successful Sources, and a failure among successes still succeeds
test("toScanSummary aggregates deduped counts, summed cost, and a succeeded status", () => {
	const summary = toScanSummary([
		{
			status: "ok",
			sourceId: "s1",
			sourceKind: "rss",
			resources: [resource("https://a"), resource("https://b")],
			costDollars: 0.5,
		},
		{ status: "ok", sourceId: "s2", sourceKind: "search", resources: [resource("https://a")], costDollars: 0.25 },
		{ status: "failed", sourceId: "s3", sourceKind: "reddit", reason: "oauth 403, rss 403" },
	])

	// two unique urls found, the two successful costs are summed, and succeeds despite the one failure
	expect(summary.foundCount).toBe(2)
	expect(summary.costDollars).toBe(0.75)

	// the failed Source is traced with its reason, and the Scan still succeeds
	expect(summary.status).toBe("succeeded")
	expect(summary.problemSources).toEqual([{ sourceId: "s3", status: "failed", reason: "oauth 403, rss 403" }])
})

// a Scan fails only when a Source errored and none succeeded
test("toScanSummary reports failed when every Source that ran threw", () => {
	// aggregate two failed outcomes
	const summary = toScanSummary([
		{ status: "failed", sourceId: "s1", sourceKind: "rss", reason: "feed returned 404" },
		{ status: "failed", sourceId: "s2", sourceKind: "search", reason: "EXA_API_KEY is not set" },
	])
	expect(summary.status).toBe("failed")
})

// a skipped source is not a failure, but it is recorded, so a skipped source doesn't hide in a succeeded scan
test("toScanSummary records skipped Sources without failing the scan", () => {
	const summary = toScanSummary([{ status: "skipped", sourceId: "s1", sourceKind: "composio" }])

	// the scan succeeds and the row names what went unread
	expect(summary.status).toBe("succeeded")
	expect(summary.problemSources).toEqual([{ sourceId: "s1", status: "skipped" }])
})

// a Source that ran its primary path cleanly leaves no trace behind
test("toScanSummary leaves the trace empty when every Source ran clean", () => {
	const summary = toScanSummary([
		{ status: "ok", sourceId: "keyed", sourceKind: "youtube", resources: [resource("https://a")], costDollars: 0 },
	])
	expect(summary.problemSources).toEqual([])
})

// only the Sources that hit a problem are traced, each with the path it fell back to. the Scan still succeeds
test("toScanSummary records the Source that fell back and the one that failed", () => {
	const summary = toScanSummary([
		{ status: "ok", sourceId: "keyed", sourceKind: "youtube", resources: [resource("https://a")], costDollars: 0 },
		{
			status: "ok",
			sourceId: "fell-back",
			sourceKind: "reddit",
			resources: [],
			costDollars: 0,
			fallbackMode: "reddit-rss",
		},
		{ status: "failed", sourceId: "blocked", sourceKind: "reddit", reason: "oauth 403, rss 403" },
	])

	// the fallback includes its fallback mode, and the failure includes its reason, and neither fails the Scan
	expect(summary.problemSources).toEqual([
		{ sourceId: "fell-back", status: "fallback", fallbackMode: "reddit-rss" },
		{ sourceId: "blocked", status: "failed", reason: "oauth 403, rss 403" },
	])
	expect(summary.status).toBe("succeeded")
})

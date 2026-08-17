// toScanSummary self-checks. counts dedupe across Sources, cost sums only the successful Sources, and the status and fallback rules hold
import { expect, test } from "bun:test"
import { toScanSummary } from "./ingest"
import type { NewResource } from "./ingest/ingester"

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

// skips are non-events. a topic with all-skipped Sources still succeeds
test("toScanSummary treats skipped Sources as non-failures", () => {
	const summary = toScanSummary([{ status: "skipped", sourceKind: "composio" }])

	// a skipped Source has no ingester behind it, so it counts as neither a failure nor a fallback
	expect(summary.status).toBe("succeeded")
	expect(summary.problemSources).toEqual([])
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

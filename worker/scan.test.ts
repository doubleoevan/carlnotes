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
			cost: 0.5,
		},
		{ status: "ok", sourceId: "s2", sourceKind: "search", resources: [resource("https://a")], cost: 0.25 },
		{ status: "failed", sourceKind: "reddit" },
	])

	// two unique urls found, the two successful costs are summed, and succeeds despite the one failure
	expect(summary.foundCount).toBe(2)
	expect(summary.cost).toBe(0.75)

	// no Source fell back, so the fallback trace stays empty
	expect(summary.status).toBe("succeeded")
	expect(summary.fallbackSources).toEqual([])
})

// a Scan fails only when a Source errored and none succeeded
test("toScanSummary reports failed when every Source that ran threw", () => {
	// aggregate two failed outcomes
	const summary = toScanSummary([
		{ status: "failed", sourceKind: "rss" },
		{ status: "failed", sourceKind: "search" },
	])
	expect(summary.status).toBe("failed")
})

// skips are non-events. a topic with all-skipped Sources still succeeds
test("toScanSummary treats skipped Sources as non-failures", () => {
	expect(toScanSummary([{ status: "skipped", sourceKind: "composio" }]).status).toBe("succeeded")
})

// only the Source that reports a fallbackMode is traced. the Scan still succeeds
test("toScanSummary records only the Source that fell back and still succeeds", () => {
	const summary = toScanSummary([
		{ status: "ok", sourceId: "keyed", sourceKind: "youtube", resources: [resource("https://a")], cost: 0 },
		{ status: "ok", sourceId: "fell-back", sourceKind: "reddit", resources: [], cost: 0, fallbackMode: "reddit-rss" },
	])

	// only the Source that fell back is traced, and falling back does not fail the Scan
	expect(summary.fallbackSources).toEqual([{ sourceId: "fell-back", fallbackMode: "reddit-rss" }])
	expect(summary.status).toBe("succeeded")
})

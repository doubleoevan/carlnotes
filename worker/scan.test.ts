// toScanSummary self-checks: counts dedupe across Sources, cost sums the runs, and the status/degradation rules hold
import { expect, test } from "bun:test"
import type { NewResource } from "./adapters/adapter"
import { toScanSummary } from "./scan"

// a fake Resource: just the url and kind the tally needs to dedupe
function resource(url: string): NewResource {
	return { url, kind: "read" }
}

// counts dedupe across Sources, cost sums only the Sources that ran, and one failure among successes still succeeds
test("toScanSummary aggregates deduped counts, summed cost, and a succeeded status", () => {
	const summary = toScanSummary([
		{ status: "ok", sourceId: "s1", resources: [resource("https://a"), resource("https://b")], cost: 0.5 },
		{ status: "ok", sourceId: "s2", resources: [resource("https://a")], cost: 0.25 },
		{ status: "failed" },
	])
	// two unique urls found, the two successful costs summed, and success despite the one failure
	expect(summary.foundCount).toBe(2)
	expect(summary.cost).toBe(0.75)
	// no Source fell back, so the degraded trace stays empty
	expect(summary.status).toBe("succeeded")
	expect(summary.degradedSources).toEqual([])
})

// a Scan fails only when a Source errored and none succeeded
test("toScanSummary reports failed when every Source that ran threw", () => {
	expect(toScanSummary([{ status: "failed" }, { status: "failed" }]).status).toBe("failed")
})

// skips are non-events: an all-skipped topic still succeeds
test("toScanSummary treats skipped Sources as non-failures", () => {
	expect(toScanSummary([{ status: "skipped" }]).status).toBe("succeeded")
})

// a Source that reports a fallbackMode is traced as degraded, and only that one, while the Scan still succeeds
test("toScanSummary records only the degraded Source and still succeeds", () => {
	const summary = toScanSummary([
		{ status: "ok", sourceId: "keyed", resources: [resource("https://a")], cost: 0 },
		{ status: "ok", sourceId: "fell-back", resources: [resource("https://b")], cost: 0, fallbackMode: "reddit-rss" },
	])
	// only the fallback Source is traced, and the degradation does not fail the Scan
	expect(summary.degradedSources).toEqual([{ sourceId: "fell-back", fallbackMode: "reddit-rss" }])
	expect(summary.status).toBe("succeeded")
})

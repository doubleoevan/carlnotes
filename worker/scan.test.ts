// toScanSummary self-checks: counts dedupe across Sources, cost sums the runs, and the status rule holds
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
		{ status: "ok", resources: [resource("https://a"), resource("https://b")], cost: 0.5 },
		{ status: "ok", resources: [resource("https://a")], cost: 0.25 },
		{ status: "failed" },
	])
	// two unique urls found, the two successful costs summed, and success despite the one failure
	expect(summary.foundCount).toBe(2)
	expect(summary.cost).toBe(0.75)
	expect(summary.status).toBe("succeeded")
})

// a Scan fails only when a Source errored and none succeeded
test("toScanSummary reports failed when every Source that ran threw", () => {
	expect(toScanSummary([{ status: "failed" }, { status: "failed" }]).status).toBe("failed")
})

// skips are non-events: an all-skipped topic still succeeds
test("toScanSummary treats skipped Sources as non-failures", () => {
	expect(toScanSummary([{ status: "skipped" }]).status).toBe("succeeded")
})

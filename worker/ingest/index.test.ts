// a Source that runs clean and brings back nothing is reported as a fallback instead of an ok
// a dead feed still responds 200 and would otherwise read as a healthy Source
import { expect, test } from "bun:test"
import { type SourceOutcome, toScanSummary } from "./index"

// one Source outcome, defaulting to a clean run that found one Resource
function toSourceOutcome(
	overrides: Partial<Extract<SourceOutcome, { status: "ok" | "fallback" }>> = {},
): SourceOutcome {
	return {
		status: "ok",
		sourceId: "src_1",
		sourceKind: "rss",
		resources: [{ url: "https://example.test/a", title: "A", snippet: "", publishedAt: null }],
		cost: 0,
		...overrides,
	} as SourceOutcome
}

test("a fallback Source keeps its cost while adding no Resources", () => {
	const scanSummary = toScanSummary([toSourceOutcome({ status: "fallback", resources: [], cost: 0.02 })])
	expect(scanSummary.foundCount).toBe(0)
	expect(scanSummary.cost).toBeCloseTo(0.02, 10)
})

// a Source that errored alongside one that ran clean but empty is not a failed Scan: nothing errored everywhere
test("a fallback Source counts as a clean run when another Source failed", () => {
	const scanSummary = toScanSummary([
		toSourceOutcome({ status: "fallback", resources: [] }),
		{ status: "failed", sourceKind: "search" },
	])
	expect(scanSummary.status).toBe("succeeded")
})

// if every Source errored it is recorded as a failed Scan
test("a Scan fails when every Source errored", () => {
	expect(toScanSummary([{ status: "failed", sourceKind: "rss" }]).status).toBe("failed")
})

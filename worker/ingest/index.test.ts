// a Source that runs clean and brings back nothing is reported as a fallback
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
		costDollars: 0,
		...overrides,
	} as SourceOutcome
}

test("a fallback Source keeps its cost while adding no Resources", () => {
	const scanSummary = toScanSummary([toSourceOutcome({ status: "fallback", resources: [], costDollars: 0.02 })])
	expect(scanSummary.foundCount).toBe(0)
	expect(scanSummary.costDollars).toBeCloseTo(0.02, 10)
})

// a Source that errored alongside one that ran clean but empty is not a failed Scan: nothing errored everywhere
test("a fallback Source counts as a clean run when another Source failed", () => {
	const scanSummary = toScanSummary([
		toSourceOutcome({ status: "fallback", resources: [] }),
		{ status: "failed", sourceId: "src_2", sourceKind: "search", reason: "exa search returned 500" },
	])
	expect(scanSummary.status).toBe("succeeded")
})

// if every Source errored it is recorded as a failed Scan
test("a Scan fails when every Source errored", () => {
	const outcome = { status: "failed", sourceId: "src_1", sourceKind: "rss", reason: "feed returned 404" } as const
	expect(toScanSummary([outcome]).status).toBe("failed")
})

// a body an ingester already fetched has to survive the dedupe to reach the store step, or the page would be
test("a Resource keeps its fetched body through the dedupe", () => {
	const fetchedBody = { markdown: "# The page", etag: 'W/"abc"', lastModified: null }
	const scanSummary = toScanSummary([
		toSourceOutcome({ resources: [{ url: "https://example.test/page", kind: "read" as const, fetchedBody }] }),
	])
	expect(scanSummary.resources[0]?.fetchedBody).toEqual(fetchedBody)
})

// only an ingester that successfully fetched hands a body over. everything else is stored without one.
test("a Resource with no fetched body keeps none", () => {
	const scanSummary = toScanSummary([toSourceOutcome()])
	expect(scanSummary.resources[0]?.fetchedBody).toBeUndefined()
})

// the first Resource seen per canonical url wins
test("a page found twice keeps the body of the first sighting", () => {
	const fetchedBody = { markdown: "# The page", etag: null, lastModified: null }
	const scanSummary = toScanSummary([
		toSourceOutcome({ resources: [{ url: "https://example.test/page", kind: "read" as const, fetchedBody }] }),
		toSourceOutcome({ sourceId: "src_2", resources: [{ url: "https://example.test/page/", kind: "read" as const }] }),
	])
	expect(scanSummary.resources).toHaveLength(1)
	expect(scanSummary.resources[0]?.fetchedBody).toEqual(fetchedBody)
})

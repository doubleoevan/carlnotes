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
		{ status: "failed", sourceKind: "search" },
	])
	expect(scanSummary.status).toBe("succeeded")
})

// if every Source errored it is recorded as a failed Scan
test("a Scan fails when every Source errored", () => {
	expect(toScanSummary([{ status: "failed", sourceKind: "rss" }]).status).toBe("failed")
})

// a Source not yet screened, or with no registered ingester, is skipped rather than run. skips are non-events,
// so a topic with only skipped Sources still succeeds instead of reading as a failed Scan
test("toScanSummary treats a skipped Source as a non-event", () => {
	expect(toScanSummary([{ status: "skipped", sourceKind: "composio" }]).status).toBe("succeeded")
})

// fallbackMode marks the keyless path an ingester took, independent of whether it still found Resources.
// an "ok" Source that fell back is traced the same as one reported "fallback"
test("toScanSummary traces fallbackMode even on a Source that still found Resources", () => {
	const scanSummary = toScanSummary([
		toSourceOutcome({ sourceId: "fell-back", sourceKind: "reddit", fallbackMode: "reddit-rss" }),
	])
	expect(scanSummary.fallbackSources).toEqual([{ sourceId: "fell-back", fallbackMode: "reddit-rss" }])
})

// a body an ingester already fetched has to survive the dedupe to reach the store step,
// or the page would be scraped a second time by review and billed twice
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

// the first Resource seen per canonical url wins, so a page found twice keeps the body of whichever ingester
// paid to fetch it, instead of being overwritten
test("a page found twice keeps the body of the first sighting", () => {
	const fetchedBody = { markdown: "# The page", etag: null, lastModified: null }
	const scanSummary = toScanSummary([
		toSourceOutcome({ resources: [{ url: "https://example.test/page", kind: "read" as const, fetchedBody }] }),
		toSourceOutcome({ sourceId: "src_2", resources: [{ url: "https://example.test/page/", kind: "read" as const }] }),
	])
	expect(scanSummary.resources).toHaveLength(1)
	expect(scanSummary.resources[0]?.fetchedBody).toEqual(fetchedBody)
})

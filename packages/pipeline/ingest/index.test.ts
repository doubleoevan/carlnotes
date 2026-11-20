// ingest tests: how toScanSummary aggregates Source outcomes, and the order and labels that ingestFromTopicSources
// reads the topic's Sources in
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { sources } from "@carlnotes/db/schema/topics"
import { newBudget } from "@carlnotes/models/budget"
import { ingestFromTopicSources, type SourceOutcome, toScannedSource, toScanSummary } from "./index"
import { toResourceDiscovery } from "./ingester"
import { MAX_SNIPPET_CHARS } from "./normalize"

// the label and duration of a Source outcome, for the tests that read neither
const UNREAD_OUTCOME_FIELDS = { label: "a source", durationMs: 0 }

// put the connection pool's own query back after each test
afterEach(() => {
	restoreConnectionPool()
})

// one Source outcome, defaulting to a clean run that found one Resource
function toSourceOutcome(
	overrides: Partial<Extract<SourceOutcome, { status: "ok" | "fallback" }>> = {},
): SourceOutcome {
	return {
		status: "ok",
		sourceId: "src_1",
		sourceKind: "rss",
		...UNREAD_OUTCOME_FIELDS,
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
		{
			status: "failed",
			sourceId: "src_2",
			sourceKind: "search",
			...UNREAD_OUTCOME_FIELDS,
			reason: "exa search returned 500",
		},
	])
	expect(scanSummary.status).toBe("succeeded")
})

// if every Source errored it is recorded as a failed Scan
test("a Scan fails when every Source errored", () => {
	const outcome = {
		status: "failed",
		sourceId: "src_1",
		sourceKind: "rss",
		...UNREAD_OUTCOME_FIELDS,
		reason: "feed returned 404",
	} as const
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

// a page that a custom Source found is marked, even if the web search found it first, and a search-only page is not
test("a Resource that any custom Source found is marked as found by one", () => {
	const scanSummary = toScanSummary([
		toSourceOutcome({
			sourceId: "src_search",
			sourceKind: "search",
			resources: [{ url: "https://example.test/both", kind: "read" as const }],
		}),
		toSourceOutcome({
			sourceId: "src_search",
			sourceKind: "search",
			resources: [{ url: "https://example.test/only", kind: "read" as const }],
		}),
		toSourceOutcome({
			sourceId: "src_rss",
			sourceKind: "rss",
			resources: [{ url: "https://example.test/both", kind: "read" as const }],
		}),
	])
	const isFromCustomSourceByUrl = Object.fromEntries(
		scanSummary.resources.map((resource) => [resource.url, resource.isFromCustomSource]),
	)
	expect(isFromCustomSourceByUrl).toEqual({ "https://example.test/both": true, "https://example.test/only": false })
})

// a Source row on topic-1 that waits on its screen, so ingest skips it without reaching an ingester
function toPendingSourceRow(sourceId: string, config: Record<string, unknown>): unknown[] {
	return toTableRow(sources, { id: sourceId, topicId: "topic-1", kind: "youtube", config, status: "pending" })
}

// the merge credits the first Source it reads, so ingest reads the Sources oldest first
test("ingest reads the topic's Sources in creation order", async () => {
	const sentQueries = stubConnectionPool()
	await ingestFromTopicSources({ topicId: "topic-1", budget: newBudget() })
	expect(sentQueries[0]?.text).toContain('order by "sources"."created_at" asc, "sources"."id" asc')
})

// an ingester may save a name during the Scan, so each outcome is labeled from the row read after the ingesters ran,
// and a Source deleted during the ingest keeps the label from the row read at the start
test("ingest labels each Source from its row after the ingesters ran", async () => {
	// the start read returns two Sources by channel id, and the read after returns one with its channel's name
	stubConnectionPool(({ text }) => {
		if (text.includes("order by")) {
			return [
				toPendingSourceRow("named", { channelId: "UC123" }),
				toPendingSourceRow("deleted", { channelId: "UC456" }),
			]
		}
		return text.includes('from "sources"') ? [["named", "youtube", { channelId: "UC123", name: "Veritasium" }]] : []
	})

	// the named Source reads by its name, and the deleted one by the id it started with
	const ingestOutcome = await ingestFromTopicSources({ topicId: "topic-1", budget: newBudget() })
	expect(ingestOutcome.summary.sourceResults.map(({ sourceId, label }) => [sourceId, label])).toEqual([
		["named", "Veritasium"],
		["deleted", "UC456"],
	])
})

// the scan report hears that a Source fell back only if it reported a fallback mode, as the source results do
test("toScannedSource reads an empty result with no fallback mode as ok, and one with a mode as fallback", () => {
	const emptyOutcome: SourceOutcome = {
		status: "fallback",
		sourceId: "s1",
		sourceKind: "rss",
		resources: [],
		costDollars: 0,
		...UNREAD_OUTCOME_FIELDS,
	}
	expect(toScannedSource(emptyOutcome)).toEqual({ sourceKind: "rss", status: "ok" })
	expect(toScannedSource({ ...emptyOutcome, sourceKind: "reddit", fallbackMode: "reddit-rss" })).toEqual({
		sourceKind: "reddit",
		status: "fallback",
		fallbackMode: "reddit-rss",
	})
})

test("a Resource whose Source returned a long text stores its snippet up to the limit", () => {
	// a feed item with a whole article as its description, and one with a short one
	const article = "A long article. ".repeat(5000)
	const scanSummary = toScanSummary([
		toSourceOutcome({
			resources: [
				{ url: "https://example.test/long", kind: "read", title: "Long", snippet: article },
				{ url: "https://example.test/short", kind: "read", title: "Short", snippet: "A short text." },
			],
		}),
	])
	const snippets = scanSummary.resources.map((resource) => resource.snippet)
	expect(snippets).toEqual([article.slice(0, MAX_SNIPPET_CHARS), "A short text."])
	expect(scanSummary.foundCount).toBe(2)
})

// a Scan's ingest result is written into its workflow history three times
test("what the stages after ingest read of 688 Resources with long snippets is under 200 KB", () => {
	// the widest Scan in dev: 688 Resources, with snippets up to 75,000 characters before the limit, and urls of 131
	// characters, which is the mean length of a stored url in dev
	const sourceId = crypto.randomUUID()
	const toUrl = (place: number): string => `https://www.example.com/${String(place).padStart(4, "0")}/`.padEnd(131, "a")
	const discoveredResources = Array.from({ length: 688 }, (_, place) => ({
		url: toUrl(place),
		kind: "read" as const,
		title: "A headline of ordinary length",
		snippet: "x".repeat(75_000),
		isFromCustomSource: false,
		sourceId,
	}))
	const resourceDiscoveries = discoveredResources.map(toResourceDiscovery)

	// each one holds its url and its Source, and a flag only if the flag is set
	expect(resourceDiscoveries[0]).toEqual({ url: discoveredResources[0]?.url ?? "", sourceId })
	expect(
		toResourceDiscovery({ ...discoveredResources[0], isFromCustomSource: true, isFromPersonalSources: true } as never),
	).toEqual({
		url: discoveredResources[0]?.url ?? "",
		sourceId,
		isFromCustomSource: true,
		isFromPersonalSources: true,
	})

	// the urls alone are 90 KB, and the whole result is a fifteenth of Temporal's 2 MB payload limit
	expect(JSON.stringify(resourceDiscoveries).length).toBeLessThan(200_000)
	expect(JSON.stringify(discoveredResources).length).toBeGreaterThan(50_000_000)
})

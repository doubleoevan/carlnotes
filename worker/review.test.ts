// review tests for the dedupe, threshold, spend, and prompt helpers
import { expect, test } from "bun:test"
import {
	buildScanReportPrompt,
	buildScorePrompt,
	canPay,
	canSpend,
	charge,
	isContentStale,
	isNearDuplicate,
	isPromoted,
	isRelevant,
	normalizeText,
	// the scan report prompt input reuses the source outcome shape the scan hands over
	type ScannedSource,
	toContentHash,
	toFetchedContentFields,
	tokenCost,
} from "./review"

// normalizeText lowercases and collapses whitespace, so that formatting noise doesn't change the hash
test("normalizeText lowercases and collapses whitespace", () => {
	expect(normalizeText("  Hello   World\n")).toBe("hello world")
})

// contentHash is stable across whitespace and case. only the same content hashes alike
test("contentHash normalizes before hashing and differs for different content", () => {
	// the same content formatted differently hashes alike
	expect(toContentHash("Hello", "World")).toBe(toContentHash("hello", "  world "))
	// different content hashes differently
	expect(toContentHash("Hello", "World")).not.toBe(toContentHash("Hello", "Mars"))
})

// the three gate predicates fire on the right side of their thresholds
test("threshold predicates gate on the right side of the boundary", () => {
	// a small cosine distance is a near-duplicate
	expect(isNearDuplicate(0.01)).toBe(true)
	expect(isNearDuplicate(0.5)).toBe(false)

	// a high similarity clears the relevance gate
	expect(isRelevant(0.9)).toBe(true)
	expect(isRelevant(0.1)).toBe(false)

	// a high cheap model score earns promotion to the premium model re-score
	expect(isPromoted(0.9)).toBe(true)
	expect(isPromoted(0.2)).toBe(false)
})

// charge accumulates per-stage costs into the total. canSpend flips to false once the budget cap is reached
test("charge accumulates the per-stage costs and the budget cap halts paid work", () => {
	// a fresh budget with a low ceiling
	const budget = {
		spent: 0,
		cap: 0.1,
		stageCosts: { embedding: 0, fetch: 0, scoringCheap: 0, scoringPremium: 0 },
		maxScoredResources: 5,
		fetchCounts: { reusedCount: 0, revalidatedCount: 0, fetchedCount: 0 },
	}
	// two charges accumulate into their buckets and the running total
	charge(budget, "fetch", 0.04)
	charge(budget, "scoringPremium", 0.04)
	expect(budget.stageCosts.fetch).toBe(0.04)
	expect(budget.stageCosts.scoringPremium).toBe(0.04)
	expect(budget.spent).toBeCloseTo(0.08)
	// still under the cap, so paid work may run
	expect(canSpend(budget)).toBe(true)
	// one more charge reaches the ceiling and halts further paid work
	charge(budget, "fetch", 0.03)
	expect(canSpend(budget)).toBe(false)
})

// tokenCost is a per-million-token dollar estimate
test("tokenCost estimates dollars from token usage", () => {
	expect(tokenCost(1_000_000, 0.5)).toBe(0.5)
	expect(tokenCost(0, 0.5)).toBe(0)
})

// isContentStale sends stored content back for revalidation once it reaches the ttl window
test("isContentStale gates on the ttl window", () => {
	const now = new Date("2026-07-24T12:00:00Z")
	// an hour old is still reusable under a one-day ttl, two days old is stale, and the exact ttl boundary is stale
	expect(isContentStale(new Date("2026-07-24T11:00:00Z"), now, 86_400_000)).toBe(false)
	expect(isContentStale(new Date("2026-07-22T12:00:00Z"), now, 86_400_000)).toBe(true)
	expect(isContentStale(new Date("2026-07-23T12:00:00Z"), now, 86_400_000)).toBe(true)
})

// canPay halts paid work once the scored-resource count reaches the cap, even while spend is under the dollar ceiling
test("canPay halts on the scored-resource count independent of spend", () => {
	// under both ceilings, paid work may run
	const budget = {
		spent: 0,
		cap: 0.5,
		stageCosts: { embedding: 0, fetch: 0, scoringCheap: 0, scoringPremium: 0 },
		maxScoredResources: 2,
		fetchCounts: { reusedCount: 0, revalidatedCount: 0, fetchedCount: 0 },
	}
	expect(canPay(budget)).toBe(true)
	// the outcome total reaches the cap while spend stays under the dollar ceiling, so paid work halts
	budget.fetchCounts.fetchedCount = 1
	budget.fetchCounts.reusedCount = 1
	expect(canPay(budget)).toBe(false)
})

// an empty scrape and a failed object-storage write both leave no key, so the snippet becomes the text to score
test("toFetchedContentFields keeps the key and scores content when stored, else falls back to the snippet", () => {
	// a successful store keeps the key and size and scores the in-memory content
	expect(toFetchedContentFields({ contentKey: "resources/r1/content.md", bytes: 12 }, "body", "snip")).toEqual({
		scoringText: "body",
		contentKey: "resources/r1/content.md",
		contentBytes: 12,
	})
	// a failed or skipped store keeps no key and scores the snippet, or empty when there is no snippet
	expect(toFetchedContentFields(null, "body", "snip")).toEqual({
		scoringText: "snip",
		contentKey: null,
		contentBytes: null,
	})
	expect(toFetchedContentFields(null, "body", null)).toEqual({ scoringText: "", contentKey: null, contentBytes: null })
})

// buildScorePrompt writes the prompt from summarize-resource.md. only the premium tier asks for the relevance explanation
test("buildScorePrompt includes content and context and gates the relevance explanation", async () => {
	// the cheap model only asks for a score
	const cheapModelResult = await buildScorePrompt("article body", "topic context", false)
	expect(cheapModelResult.prompt).toContain("article body")
	expect(cheapModelResult.prompt).toContain("topic context")
	expect(cheapModelResult.prompt).not.toContain("relevanceExplanation")

	// the premium model also asks for the relevance explanation, with no markers or placeholders leaking through
	const premiumModelResult = await buildScorePrompt("body", "ctx", true)
	expect(premiumModelResult.prompt).toContain("relevanceExplanation")
	expect(premiumModelResult.prompt).not.toContain("premium-tier")
	expect(premiumModelResult.prompt).not.toContain("{{")

	// without Langfuse keys, no registry prompt is attached
	expect(cheapModelResult.registryPrompt).toBeUndefined()
})

// buildScanReportPrompt writes the report prompt from summarize-topic-scan.md over the scan's tallies, sources, and costs
test("buildScanReportPrompt grounds the report prompt in the scan's data", async () => {
	// one kept finding with its reader-facing note
	const keptFinding = { title: "One", url: "https://a.com/1", relevanceScore: 0.91, relevanceExplanation: "agent news" }

	// per-cause drop counts plus the deferred and failed counts
	const reviewOutcome = {
		keptFindings: [keptFinding],
		filteredCounts: { "duplicate content": 2, "near-duplicate": 1, "below relevance threshold": 4 },
		deferredCount: 1,
		failedCount: 0,
	}

	// the spend breakdown the cost line renders, and two sources with different outcomes
	const stageCosts = { embedding: 0.01, fetch: 0.02, scoringCheap: 0.03, scoringPremium: 0.0634 }
	const budget = {
		spent: 0.1234,
		cap: 0.5,
		stageCosts,
		maxScoredResources: 25,
		fetchCounts: { reusedCount: 0, revalidatedCount: 0, fetchedCount: 0 },
	}
	const scannedSources: ScannedSource[] = [
		{ sourceKind: "rss", status: "ok" },
		{ sourceKind: "search", status: "failed" },
	]

	// render the report prompt over the sample scan
	const { prompt: reportPrompt } = await buildScanReportPrompt({
		topicName: "LLM tooling",
		topicContext: "agents and prompt engineering",
		date: "July 21, 2026",
		// the grounded data blocks
		reviewOutcome,
		scannedSources,
		budget,
	})

	// the date, kept finding, drop causes, and source outcomes all land in the prompt
	expect(reportPrompt).toContain("July 21, 2026")
	expect(reportPrompt).toContain("https://a.com/1")
	expect(reportPrompt).toContain("agent news")
	expect(reportPrompt).toContain("duplicate content: 2")
	expect(reportPrompt).toContain("rss: ok")
	expect(reportPrompt).toContain("search: failed")

	// the report beats survive rendering and no placeholder is left unfilled
	expect(reportPrompt).toContain("worth flagging")
	expect(reportPrompt).not.toContain("{{")
})

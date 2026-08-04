// score tests for the promotion threshold, the content ttl, bounded concurrency, and the score prompt
import { expect, test } from "bun:test"
import { canScoreResource, newBudget } from "../budget"
import { buildScorePrompt, isContentStale, isPromoted, runWithConcurrency, toFetchedContentFields } from "./score"

// a high cheap-model score earns promotion to the premium score-model's re-score
test("isPromoted gates on the promotion threshold", () => {
	expect(isPromoted(0.9)).toBe(true)
	expect(isPromoted(0.2)).toBe(false)
})

// isContentStale sends stored content back for revalidation once it reaches the ttl window
test("isContentStale gates on the ttl window", () => {
	const now = new Date("2026-07-24T12:00:00Z")
	// an hour old is still reusable under a one-day ttl, two days old is stale, and the exact ttl boundary is stale
	expect(isContentStale(new Date("2026-07-24T11:00:00Z"), now, 86_400_000)).toBe(false)
	expect(isContentStale(new Date("2026-07-22T12:00:00Z"), now, 86_400_000)).toBe(true)
	expect(isContentStale(new Date("2026-07-23T12:00:00Z"), now, 86_400_000)).toBe(true)
})

// the paid section runs concurrently but bounded, since an unbounded burst draws Firecrawl 429s
test("mapWithConcurrency never exceeds its limit and returns results in order", async () => {
	// track how many tasks are in flight at once, recording the high-water mark
	let inFlight = 0
	let peakInFlight = 0
	const results = await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
		// enter the slot, yield so other workers interleave, then leave it
		inFlight++
		peakInFlight = Math.max(peakInFlight, inFlight)
		await Promise.resolve()
		inFlight--
		return item * 2
	})

	// every item ran, in input order, and no more than the limit was ever in flight
	expect(results).toEqual([2, 4, 6, 8, 10, 12, 14])
	expect(peakInFlight).toBeLessThanOrEqual(3)
})

// the plan limit is checked before each dispatch, so once it trips the rest are deferred instead of bought
test("the plan limit check halts dispatch once either ceiling is reached", async () => {
	// a budget that admits two resources before its scored-resource ceiling trips
	const budget = { ...newBudget(), cap: 0.5, maxScoredResources: 2 }

	// dispatch five resources the way the ranked pass does, checking the ceiling before paying for each
	const outcomes = await runWithConcurrency([1, 2, 3, 4, 5], 1, async (item) => {
		if (!canScoreResource(budget)) {
			return "deferred"
		}
		budget.fetchCounts.fetchedCount++
		return `kept ${item}`
	})

	// the first two were bought, and the rest deferred, without failing anything
	expect(outcomes).toEqual(["kept 1", "kept 2", "deferred", "deferred", "deferred"])
})

// an empty scrape and a failed object-storage write both leave no key, so the snippet becomes the text to score
test("toFetchedContentFields keeps the key and scores content when stored, else falls back to the snippet", () => {
	// a successful store keeps the key and size and scores the in-memory content
	expect(toFetchedContentFields({ contentKey: "resources/r1/content.md", bytes: 12 }, "body", "snip")).toEqual({
		scoringText: "body",
		contentKey: "resources/r1/content.md",
		contentBytes: 12,
	})
	// a failed or skipped store keeps no key and scores the snippet, or leaves the content empty when there is no snippet
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

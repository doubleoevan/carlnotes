// score tests for the promotion threshold, the content ttl, bounded concurrency, and the score prompt
import { expect, test } from "bun:test"
import type { scans } from "../../db/schema"
import { newBudget } from "../budget"
import { isContentStale } from "../scrape"
import type { Resource } from "./filter"
import {
	buildScorePrompt,
	fetchAndScoreResources,
	isPromoted,
	runWithConcurrency,
	toFetchedContentFields,
} from "./score"
import { emptyReviewOutcome } from "./track"

// a persisted Scan row, declared here so score.ts keeps its own copy private
type Scan = typeof scans.$inferSelect

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
test("runWithConcurrency never exceeds its limit and returns results in order", async () => {
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

	// every item ran, in input order, and the limit was actually reached, not just never exceeded,
	// so a regression to a serial loop (which never exceeds the limit either) would fail this
	expect(results).toEqual([2, 4, 6, 8, 10, 12, 14])
	expect(peakInFlight).toBe(3)
})

// the plan limit is the same canScoreResource guard fetchAndScoreResource runs before doing any paid work,
// so deleting that guard would leave every resource here bought instead of deferred, and this test would fail
test("fetchAndScoreResources defers every admitted Resource once the plan limit is already reached", async () => {
	// no scoring room left, so the guard trips before a resource is fetched, screened, or scored
	const budget = { ...newBudget(), maxScoredResources: 0 }
	const admittedResources = [
		{ id: "r1", url: "https://a.test" },
		{ id: "r2", url: "https://b.test" },
	] as unknown as Resource[]
	const scan = { id: "scan1" } as unknown as Scan
	const topicContext = { name: "topic", text: "topic context", embedding: [] }
	const reviewOutcome = emptyReviewOutcome()

	const scoredResourceIds = await fetchAndScoreResources(
		admittedResources,
		scan,
		"topic1",
		topicContext,
		reviewOutcome,
		budget,
	)

	// nothing was bought, and the review outcome recorded both resources as deferred
	expect(scoredResourceIds).toEqual([])
	expect(reviewOutcome.deferredCount).toBe(2)
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

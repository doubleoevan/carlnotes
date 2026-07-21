// curation tests for the pure dedupe, threshold, spend, and prompt helpers
import { expect, test } from "bun:test"
import {
	buildScorePrompt,
	buildSummaryPrompt,
	canSpend,
	charge,
	contentHash,
	isNearDuplicate,
	isPromoted,
	isRelevant,
	normalizeText,
	tokenCost,
} from "./curation"

// normalizeText lowercases and collapses whitespace, so that formatting noise doesn't change the hash
test("normalizeText lowercases and collapses whitespace", () => {
	expect(normalizeText("  Hello   World\n")).toBe("hello world")
})

// contentHash is stable across whitespace and case. only the same content hashes alike
test("contentHash normalizes before hashing and differs for different content", () => {
	// the same content formatted differently hashes alike
	expect(contentHash("Hello", "World")).toBe(contentHash("hello", "  world "))
	// different content hashes differently
	expect(contentHash("Hello", "World")).not.toBe(contentHash("Hello", "Mars"))
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

// charge accumulates per-stage and into the total. canSpend flips to false once the budget cap is reached
test("charge tallies per-stage cost and the budget cap halts paid work", () => {
	// a fresh budget with a low ceiling
	const budget = { spent: 0, cap: 0.1, stageCosts: { embedding: 0, fetch: 0, scoringCheap: 0, scoringPremium: 0 } }
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

// buildScorePrompt carries the content and context. it asks for a relevance summary only if promoted to the premium model
test("buildScorePrompt includes content and context and gates the relevance summary", () => {
	// the cheap model only asks for a score
	const cheapModelPrompt = buildScorePrompt("article body", "topic context", false)
	expect(cheapModelPrompt).toContain("article body")
	expect(cheapModelPrompt).toContain("topic context")
	expect(cheapModelPrompt).not.toContain("why-summary")

	// the premium model also asks for the why-summary
	expect(buildScorePrompt("body", "ctx", true)).toContain("why-summary")
})

// buildSummaryPrompt reports the kept and filtered resource result counts in the recap prompt
test("buildSummaryPrompt reports the scan result counts", () => {
	const prompt = buildSummaryPrompt(3, 7, ["relevant to the topic"])
	expect(prompt).toContain("3")
	expect(prompt).toContain("7")
	expect(prompt).toContain("relevant to the topic")
})

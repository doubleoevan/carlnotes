// track tests for the spend accounting and the ceilings the paid stages read off it
import { expect, test } from "bun:test"
import { canPay, canSpend, charge, tokenCost } from "./track"

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

// track tests for the spend accounting and the ceilings every stage of a Scan reads off it
import { expect, test } from "bun:test"
import { canScoreResource, canSpend, charge, newBudget, tokenCost } from "../budget"

// charge accumulates per-stage costs into the total. canSpend flips to false once the budget cap is reached
test("charge accumulates the per-stage costs and the budget cap halts paid work", () => {
	// a fresh budget with a low ceiling
	const budget = { ...newBudget(), cap: 0.1, maxScoredResources: 5 }
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

// ingestion charges into the same budget the review stages read, so the ceiling covers what a paid Source spent
test("ingestion spend counts against the Scan's ceiling", () => {
	// a Scan whose search Source alone consumes the whole ceiling
	const budget = { ...newBudget(), cap: 0.1 }
	charge(budget, "ingestion", 0.1)

	// the ingestion bucket carries it, the running total sees it, and no review stage may spend after it
	expect(budget.stageCosts.ingestion).toBeCloseTo(0.1)
	expect(budget.spent).toBeCloseTo(0.1)
	expect(canSpend(budget)).toBe(false)
})

// a keyless ingester reports no cost, so a Scan with only free Sources charges nothing for ingestion
test("a free Source leaves the ingestion bucket at zero", () => {
	const budget = newBudget()
	charge(budget, "ingestion", 0)
	expect(budget.stageCosts.ingestion).toBe(0)
	expect(budget.spent).toBe(0)
})

// canScoreResource halts paid work once the scored-resource count reaches the cap, even while spend is under the dollar ceiling
test("canScoreResource halts on the scored-resource count independent of spend", () => {
	// under both ceilings, paid work may run
	const budget = { ...newBudget(), cap: 0.5, maxScoredResources: 2 }
	expect(canScoreResource(budget)).toBe(true)
	// the outcome total reaches the cap while spend stays under the dollar ceiling, so paid work halts
	budget.fetchCounts.fetchedCount = 1
	budget.fetchCounts.reusedCount = 1
	expect(canScoreResource(budget)).toBe(false)
})

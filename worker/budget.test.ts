// the Budget crosses a Temporal activity boundary between the topic Scan's stages, so it is serialized and restored between them.
// these tests cover that hand-off, since a spend that does not survive it is a ceiling that stops applying
import { describe, expect, test } from "bun:test"
import { type Budget, canScoreResource, canSpend, charge, newBudget } from "./budget"

// what Temporal does to a value that crosses an activity boundary
function acrossActivityBoundary(budget: Budget): Budget {
	return JSON.parse(JSON.stringify(budget))
}

describe("a Budget crossing between stages", () => {
	test("includes its total and its per-stage breakdown intact", () => {
		// the first stage spends against two buckets, the way ingestion and embedding charges before review runs
		const ingestBudget = newBudget()
		charge(ingestBudget, "ingestion", 0.02)
		charge(ingestBudget, "embedding", 0.03)

		const reviewBudget = acrossActivityBoundary(ingestBudget)
		expect(reviewBudget.spent).toBeCloseTo(0.05, 10)
		expect(reviewBudget.stageCosts.ingestion).toBeCloseTo(0.02, 10)
		expect(reviewBudget.stageCosts.embedding).toBeCloseTo(0.03, 10)
	})

	test("keeps the ceiling it was created with, so the later stage measures against the same limit", () => {
		// the ceilings are read from the environment when the Budget is made, which a workflow may not do
		const revivedBudget = acrossActivityBoundary(newBudget())
		expect(revivedBudget.cap).toBe(newBudget().cap)
		expect(revivedBudget.maxScoredResources).toBe(newBudget().maxScoredResources)
	})

	test("a stage starting from a spent-out Budget respects the ceiling already reached", () => {
		// the first stage spends the whole ceiling, so the second stage must refuse to pay for anything more
		const spentOutBudget = newBudget()
		charge(spentOutBudget, "fetch", spentOutBudget.cap)

		const nextStageBudget = acrossActivityBoundary(spentOutBudget)
		expect(canSpend(nextStageBudget)).toBe(false)
		expect(canScoreResource(nextStageBudget)).toBe(false)
	})

	test("a stage starting from a partly spent Budget may still buy", () => {
		// half the ceiling is still under it, so the review picks up where ingest left off instead of being capped out
		const partlySpentBudget = newBudget()
		charge(partlySpentBudget, "fetch", partlySpentBudget.cap / 2)

		const nextStageBudget = acrossActivityBoundary(partlySpentBudget)
		expect(canSpend(nextStageBudget)).toBe(true)
		expect(canScoreResource(nextStageBudget)).toBe(true)
	})

	test("includes the scored-resource count, so the paid scoring section's ceiling is not reset by the boundary", () => {
		// review counts every Resource it scored on the Budget, and a retry that lost those counts would rebuy them
		const scoredBudget = newBudget()
		scoredBudget.fetchCounts.fetchedCount = scoredBudget.maxScoredResources

		const nextStageBudget = acrossActivityBoundary(scoredBudget)
		expect(nextStageBudget.fetchCounts.fetchedCount).toBe(scoredBudget.maxScoredResources)
		expect(canScoreResource(nextStageBudget)).toBe(false)
	})
})

describe("charge", () => {
	test("mutates the Budget it is given, and parallel scoring tasks charge the same budget", () => {
		// the paid section charges from tasks running under REVIEW_CONCURRENCY.
		// a copy per task would keep only whichever charge finished last, and every charge but one would go unrecorded
		const budget = newBudget()
		const tasks = [0.01, 0.02, 0.03]
		for (const dollars of tasks) {
			charge(budget, "scoringCheap", dollars)
		}
		// every charge landed, not just the last one
		expect(budget.spent).toBeCloseTo(0.06, 10)
		expect(budget.stageCosts.scoringCheap).toBeCloseTo(0.06, 10)
	})
})

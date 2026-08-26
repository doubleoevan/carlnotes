// the Budget crosses a Temporal activity boundary between the topic Scan's stages
import { describe, expect, test } from "bun:test"
import { type Budget, canScoreResource, canSpend, charge, newBudget, toResumedBudget } from "./budget"

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
		expect(reviewBudget.spentDollars).toBeCloseTo(0.05, 10)
		expect(reviewBudget.stageCosts.ingestion).toBeCloseTo(0.02, 10)
		expect(reviewBudget.stageCosts.embedding).toBeCloseTo(0.03, 10)
	})

	test("keeps the limit it was created with, so the later stage measures against the same limit", () => {
		// the limits are read from the environment when the Budget is made, which a workflow may not do
		const revivedBudget = acrossActivityBoundary(newBudget())
		expect(revivedBudget.limitDollars).toBe(newBudget().limitDollars)
		expect(revivedBudget.maxScoredResources).toBe(newBudget().maxScoredResources)
	})

	test("a stage starting from a spent-out Budget respects the limit already reached", () => {
		// the first stage spends the whole limit, so the second stage must refuse to pay for anything more
		const spentOutBudget = newBudget()
		charge(spentOutBudget, "fetch", spentOutBudget.limitDollars)

		const nextStageBudget = acrossActivityBoundary(spentOutBudget)
		expect(canSpend(nextStageBudget)).toBe(false)
		expect(canScoreResource(nextStageBudget)).toBe(false)
	})

	test("a stage starting from a partly spent Budget may still buy", () => {
		// half the limit is still under it, so the review picks up where ingest left off instead of being limited out
		const partlySpentBudget = newBudget()
		charge(partlySpentBudget, "fetch", partlySpentBudget.limitDollars / 2)

		const nextStageBudget = acrossActivityBoundary(partlySpentBudget)
		expect(canSpend(nextStageBudget)).toBe(true)
		expect(canScoreResource(nextStageBudget)).toBe(true)
	})

	test("includes the scored-resource count, so the paid scoring section's limit is not reset by the boundary", () => {
		// review counts every Resource it scored on the Budget, and a retry that lost those counts would rebuy them
		const scoredBudget = newBudget()
		scoredBudget.fetchCounts.fetchedCount = scoredBudget.maxScoredResources

		const nextStageBudget = acrossActivityBoundary(scoredBudget)
		expect(nextStageBudget.fetchCounts.fetchedCount).toBe(scoredBudget.maxScoredResources)
		expect(canScoreResource(nextStageBudget)).toBe(false)
	})
})

describe("a Budget resumed from a heartbeat checkpoint", () => {
	test("continues the counters the last attempt had reached", () => {
		// the attempt that died had spent against two buckets and scored some Resources
		const checkpoint = newBudget()
		charge(checkpoint, "fetch", 0.04)
		charge(checkpoint, "scoringPremium", 0.06)
		checkpoint.fetchCounts.fetchedCount = 7

		const resumedBudget = toResumedBudget(acrossActivityBoundary(checkpoint), newBudget())
		expect(resumedBudget.spentDollars).toBeCloseTo(0.1, 10)
		expect(resumedBudget.stageCosts.fetch).toBeCloseTo(0.04, 10)
		expect(resumedBudget.fetchCounts.fetchedCount).toBe(7)
	})

	test("takes its limits from a fresh Budget, so a resumed Scan cannot regain an allowance it already spent", () => {
		// a checkpoint with its own limits would let a Scan that scored to the limit buy the whole allowance again
		const checkpoint = newBudget()
		checkpoint.fetchCounts.fetchedCount = checkpoint.maxScoredResources
		const staleLimits = { ...checkpoint, limitDollars: 999, maxScoredResources: 999 }

		const resumedBudget = toResumedBudget(staleLimits, newBudget())
		expect(resumedBudget.limitDollars).toBe(newBudget().limitDollars)
		expect(resumedBudget.maxScoredResources).toBe(newBudget().maxScoredResources)
		expect(canScoreResource(resumedBudget)).toBe(false)
	})

	test("falls back to the passed Budget when there is no checkpoint to read", () => {
		// a stage on its first attempt, and a stage called directly with no activity context, both land here
		const passedBudget = newBudget()
		charge(passedBudget, "ingestion", 0.01)

		expect(toResumedBudget(undefined, passedBudget)).toBe(passedBudget)
		expect(toResumedBudget(null, passedBudget)).toBe(passedBudget)
	})

	test("falls back to the passed Budget when the checkpoint is not one", () => {
		// a truncated or foreign detail would otherwise resume from partial counters and undercount the spend
		const passedBudget = newBudget()
		charge(passedBudget, "ingestion", 0.01)

		expect(toResumedBudget({ spentDollars: 5 }, passedBudget)).toBe(passedBudget)
		expect(toResumedBudget({ ...newBudget(), stageCosts: { fetch: 1 } }, passedBudget)).toBe(passedBudget)
		expect(toResumedBudget("checkpoint", passedBudget)).toBe(passedBudget)
	})
})

describe("charge", () => {
	test("mutates the Budget it is given, and parallel scoring tasks charge the same budget", () => {
		// the paid section charges from tasks running under REVIEW_CONCURRENCY
		const budget = newBudget()
		const tasks = [0.01, 0.02, 0.03]
		for (const dollars of tasks) {
			charge(budget, "scoringCheap", dollars)
		}
		// every charge landed, not just the last one
		expect(budget.spentDollars).toBeCloseTo(0.06, 10)
		expect(budget.stageCosts.scoringCheap).toBeCloseTo(0.06, 10)
	})
})

describe("a Scan the user stopped", () => {
	test("scores no further Resources, however much budget is left", () => {
		// the stop reads as another limit reached, so the Resources still queued are deferred instead of scored
		const budget = newBudget()
		const stopSignal = AbortSignal.abort()

		expect(canScoreResource(budget)).toBe(true)
		expect(canScoreResource(budget, stopSignal)).toBe(false)
	})

	test("buys nothing else at all, so no embedding or recap is paid for after it", () => {
		// every paid step outside scoring reads canSpend, and a stop has to close those too
		const budget = newBudget()
		const stopSignal = AbortSignal.abort()

		expect(canSpend(budget)).toBe(true)
		expect(canSpend(budget, stopSignal)).toBe(false)
	})

	test("keeps scoring until the stop signal is received", () => {
		// a Scan nobody stopped has a signal that has not aborted, which changes nothing about the gate
		const budget = newBudget()
		const stopController = new AbortController()

		expect(canScoreResource(budget, stopController.signal)).toBe(true)
		stopController.abort()
		expect(canScoreResource(budget, stopController.signal)).toBe(false)
	})
})

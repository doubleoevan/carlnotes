// track tests for folding a Resource's outcome into the running review totals, and summing the filtered count from them
import { expect, test } from "bun:test"
import { countFilteredResources, emptyReviewOutcome, type ResourceOutcome, trackOutcomes } from "./track"

// a kept outcome stores its finding for the scan report
test("trackOutcomes stores a kept outcome's finding", () => {
	const reviewOutcome = emptyReviewOutcome()
	const finding = { title: "A", url: "https://a", relevanceScore: 0.9, relevanceExplanation: "on topic" }
	trackOutcomes(reviewOutcome, { status: "kept", finding })
	expect(reviewOutcome.keptFindings).toEqual([finding])
})

// a filtered outcome counts under its drop cause, not the others
test("trackOutcomes counts a filtered outcome under its own reason", () => {
	const reviewOutcome = emptyReviewOutcome()
	trackOutcomes(reviewOutcome, { status: "filtered", reason: "near-duplicate" })
	expect(reviewOutcome.filteredCounts["near-duplicate"]).toBe(1)
	expect(reviewOutcome.filteredCounts["duplicate content"]).toBe(0)
})

// a deferred outcome is a plain count, spent by the budget cap rather than a review decision
test("trackOutcomes counts a deferred outcome", () => {
	const reviewOutcome = emptyReviewOutcome()
	trackOutcomes(reviewOutcome, { status: "deferred" })
	expect(reviewOutcome.deferredCount).toBe(1)
})

// a failed outcome, and any status this union does not name, both fall into the failed count.
// that silent else branch is what keeps a future status from vanishing uncounted
test("trackOutcomes counts a failed outcome, and an unrecognized status the same way", () => {
	const reviewOutcome = emptyReviewOutcome()
	trackOutcomes(reviewOutcome, { status: "failed" })
	trackOutcomes(reviewOutcome, { status: "made-up" } as unknown as ResourceOutcome)
	expect(reviewOutcome.failedCount).toBe(2)
})

// the filtered total sums every drop cause, not just the ones that were hit
test("countFilteredResources sums every filter reason", () => {
	const reviewOutcome = emptyReviewOutcome()
	trackOutcomes(reviewOutcome, { status: "filtered", reason: "near-duplicate" })
	trackOutcomes(reviewOutcome, { status: "filtered", reason: "near-duplicate" })
	trackOutcomes(reviewOutcome, { status: "filtered", reason: "below relevance threshold" })
	expect(countFilteredResources(reviewOutcome)).toBe(3)
})

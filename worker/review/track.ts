// track what became of each finding reviewed finding a review looked at

// the reasons a Resource is filtered out
export type FilterReason =
	| "duplicate content"
	| "near-duplicate"
	| "below relevance threshold"
	| "flagged by scanner"
	| "no text to score"

// a kept resource finding's details, collected for the scan report
export type KeptFinding = { title: string | null; url: string; relevanceScore: number; relevanceExplanation: string }

// the outcome of one Resource's pipeline. whether it was kept, filtered out, deferred by the spend limit, or failed
export type ResourceOutcome =
	| { status: "kept"; finding: KeptFinding }
	| { status: "filtered"; reason: FilterReason }
	| { status: "deferred" }
	| { status: "failed" }

// the review outcome the scan report reads
export type ReviewOutcome = {
	keptFindings: KeptFinding[]
	filteredCounts: Record<FilterReason, number>
	deferredCount: number
	failedCount: number
}

// the summary returned to the scan by the review
// biome-ignore format: one line keeps the type under the comment-density hook's limit
export type ReviewSummary = { keptCount: number; filteredCount: number; scanSummary: string; scoredResourceIds: string[] }

/**
 * Fold one Resource's outcome into the running totals.
 */
export function trackOutcomes(reviewOutcome: ReviewOutcome, resourceOutcome: ResourceOutcome): void {
	// a kept outcome stores its feed-facing finding
	if (resourceOutcome.status === "kept") {
		reviewOutcome.keptFindings.push(resourceOutcome.finding)
		return
	}

	// a filtered outcome counts under its drop cause
	if (resourceOutcome.status === "filtered") {
		reviewOutcome.filteredCounts[resourceOutcome.reason]++
		return
	}

	// deferred and failed are plain counts
	if (resourceOutcome.status === "deferred") {
		reviewOutcome.deferredCount++
	} else {
		reviewOutcome.failedCount++
	}
}

/**
 * The filtered total the Scan records, summed across drop causes.
 */
export function countFilteredResources(reviewOutcome: ReviewOutcome): number {
	return Object.values(reviewOutcome.filteredCounts).reduce((sum, count) => sum + count, 0)
}

/**
 * A fresh zeroed review outcome to track outcomes into.
 */
export function emptyReviewOutcome(): ReviewOutcome {
	return {
		keptFindings: [],
		// each drop cause starts spelled out at zero
		filteredCounts: {
			"duplicate content": 0,
			"near-duplicate": 0,
			"below relevance threshold": 0,
			"flagged by scanner": 0,
			"no text to score": 0,
		},
		deferredCount: 0,
		failedCount: 0,
	}
}

/**
 * The summary a Scan that reviewed nothing records
 */
export function emptyReviewSummary(): ReviewSummary {
	return { keptCount: 0, filteredCount: 0, scanSummary: "", scoredResourceIds: [] }
}

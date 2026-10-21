// track what became of each Resource a review looked at

// the reasons a Resource is filtered out
export type FilterReason =
	| "duplicate content"
	| "near-duplicate"
	| "below relevance threshold"
	| "flagged by scanner"
	| "no text to score"

// a finding the review kept, with its resource's title and url
export type KeptFinding = {
	title: string | null
	url: string
	relevanceScore: number
	relevanceExplanation: string
	// whether this scan added the finding to the topic
	isNew: boolean
}

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
export type ReviewSummary = {
	// how many findings the review kept, and how many resources it filtered out
	keptCount: number
	filteredCount: number
	// how many findings this scan added and kept, plus how many existing findings the topic's limit filtered out
	addedOrFilteredFindingCount: number
	// Carl's summary of the scan, or an empty string if there is none
	scanSummary: string
	// the resources the review sent to scoring, and the ones it scored
	resourceIdsToScore: string[]
	scoredResourceIds: string[]
}

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

// the finding counts a review reads around the filter on the topic's findings
type CountAddedOrFilteredFindingsOptions = {
	// the findings this scan added, before and after the filter
	newFindingCount: number
	keptNewFindingCount: number
	// every finding the filter removed, new or existing
	filteredFindingCount: number
}

/**
 * Counts the Findings a Scan added and kept, plus the existing Findings it filtered out.
 */
export function countAddedOrFilteredFindings({
	newFindingCount,
	keptNewFindingCount,
	filteredFindingCount,
}: CountAddedOrFilteredFindingsOptions): number {
	// leave out the findings this scan added and then filtered out. those findings never show on the topic page
	const filteredNewFindingCount = newFindingCount - keptNewFindingCount
	const filteredExistingFindingCount = Math.max(0, filteredFindingCount - filteredNewFindingCount)
	return keptNewFindingCount + filteredExistingFindingCount
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
	return {
		keptCount: 0,
		filteredCount: 0,
		addedOrFilteredFindingCount: 0,
		scanSummary: "",
		resourceIdsToScore: [],
		scoredResourceIds: [],
	}
}

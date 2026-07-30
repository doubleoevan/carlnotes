// the running totals one Scan's review keeps: dollars charged per stage, how many Resources were scored, and
// what became of each candidate. the ceilings the paid stages check are reads of these same totals

// the per-Scan spend ceiling. only the paid fetch and scoring stages are gated by it
const REVIEW_SCAN_BUDGET_USD = Number(Bun.env.REVIEW_SCAN_BUDGET_USD ?? "0.5")

// the approximate ceiling on how many resources one Scan scores, bounding the paid fetch-and-scoring section.
// it is checked before dispatch, so concurrency can overshoot it slightly. the environment can override it
const MAX_SCORED_RESOURCES_PER_SCAN = Number(Bun.env.MAX_SCORED_RESOURCES_PER_SCAN ?? "30")

// best-effort dollar rates for the soft cap and the per-stage breakdown. LiteLLM meters the authoritative spend
export const EMBED_COST_PER_MILLION_TOKENS = 0.1
export const CHEAP_COST_PER_MILLION_TOKENS = 0.2
export const PREMIUM_COST_PER_MILLION_TOKENS = 0.6
export const FIRECRAWL_COST_PER_FETCH = 0.001

// the per-stage dollar breakdown recorded on the Scan
export type StageCosts = { embedding: number; fetch: number; scoringCheap: number; scoringPremium: number }

// the fetch outcome for one Resource: content reused within the ttl, revalidated by a 304, or freshly fetched
export type FetchOutcome = "reused" | "revalidated" | "fetched"
export type FetchOutcomeCounts = { reusedCount: number; revalidatedCount: number; fetchedCount: number }

// the running budget threaded through the paid stages: dollars spent and the dollar ceiling, the per-stage cost breakdown,
// the limit on how many resources may be scored, and the reused/revalidated/fetched counts
export type Budget = {
	spent: number
	cap: number
	stageCosts: StageCosts
	maxScoredResources: number
	fetchCounts: FetchOutcomeCounts
}

// the reasons the free stages drop a Resource before any paid work
export type FilterReason = "duplicate content" | "near-duplicate" | "below relevance threshold"

// a kept resource finding's details, collected for the scan report
export type KeptFinding = { title: string | null; url: string; relevanceScore: number; relevanceExplanation: string }

// the outcome of one Resource's pipeline. whether it was kept, filtered out, deferred by the spend cap, or failed
export type ResourceOutcome =
	| { status: "kept"; finding: KeptFinding }
	| { status: "filtered"; reason: FilterReason }
	| { status: "deferred" }
	| { status: "failed" }

// the review outcome the scan report reads: kept resource finding details, per-reason filter counts, and the deferred and failed counts
export type ReviewOutcome = {
	keptFindings: KeptFinding[]
	filteredCounts: Record<FilterReason, number>
	deferredCount: number
	failedCount: number
}

// the scan review summary with resource counts, costs, fetch-outcome counts, and scan summary
export type ReviewSummary = {
	keptCount: number
	filteredCount: number
	cost: number
	stageCosts: Record<string, number>
	scanSummary: string
	// the reused, revalidated, and fetched counts the Scan records
	reusedCount: number
	revalidatedCount: number
	fetchedCount: number
}

/**
 * Add a stage's estimated dollars to both its bucket and the running total.
 */
export function charge(budget: Budget, stage: keyof StageCosts, dollars: number): void {
	budget.stageCosts[stage] += dollars
	budget.spent += dollars
}

/**
 * A best-effort dollar estimate from token usage. LiteLLM tracks the authoritative spend.
 */
export function tokenCost(tokens: number, ratePerMillion: number): number {
	return (tokens / 1_000_000) * ratePerMillion
}

/**
 * Whether paid tasks may still run, meaning the Scan is under its spend ceiling.
 */
export function canSpend(budget: Budget): boolean {
	return budget.spent < budget.cap
}

/**
 * Whether a Resource may still be scored, meaning the Scan is under both its dollar and scored-resource ceilings.
 */
export function canPay(budget: Budget): boolean {
	return budget.spent < budget.cap && scoredCount(budget) < budget.maxScoredResources
}

/**
 * How many Resources the Scan has scored so far.
 */
export function scoredCount(budget: Budget): number {
	return budget.fetchCounts.reusedCount + budget.fetchCounts.revalidatedCount + budget.fetchCounts.fetchedCount
}

/**
 * The count a fetch outcome increments. The two are named apart so an outcome reads as what happened, not as a tally.
 */
export function toFetchCountKey(fetchOutcome: FetchOutcome): keyof FetchOutcomeCounts {
	// each outcome has exactly one count, so a new outcome fails to compile until its count exists
	const countKeys: Record<FetchOutcome, keyof FetchOutcomeCounts> = {
		reused: "reusedCount",
		revalidated: "revalidatedCount",
		fetched: "fetchedCount",
	}
	return countKeys[fetchOutcome]
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

/**
 * A fresh budget at this Scan's configured ceilings, with every tally at zero.
 */
export function newBudget(): Budget {
	return {
		spent: 0,
		cap: REVIEW_SCAN_BUDGET_USD,
		stageCosts: emptyStageCosts(),
		maxScoredResources: MAX_SCORED_RESOURCES_PER_SCAN,
		fetchCounts: emptyFetchCounts(),
	}
}

/**
 * A fresh zeroed review outcome to track outcomes into.
 */
export function emptyReviewOutcome(): ReviewOutcome {
	return {
		keptFindings: [],
		// each drop cause starts spelled out at zero
		filteredCounts: { "duplicate content": 0, "near-duplicate": 0, "below relevance threshold": 0 },
		deferredCount: 0,
		failedCount: 0,
	}
}

// a new zeroed per-stage breakdown to hydrate
function emptyStageCosts(): StageCosts {
	return { embedding: 0, fetch: 0, scoringCheap: 0, scoringPremium: 0 }
}

// a new zeroed reused/revalidated/fetched count outcome to hydrate
function emptyFetchCounts(): FetchOutcomeCounts {
	return { reusedCount: 0, revalidatedCount: 0, fetchedCount: 0 }
}

/**
 * The summary a Scan that reviewed nothing records.
 */
export function emptyReviewSummary(): ReviewSummary {
	return {
		keptCount: 0,
		filteredCount: 0,
		cost: 0,
		stageCosts: {},
		scanSummary: "",
		reusedCount: 0,
		revalidatedCount: 0,
		fetchedCount: 0,
	}
}

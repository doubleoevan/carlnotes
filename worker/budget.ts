// what one Scan may spend and what it has spent. created before ingestion and updated through every stage,
// ingest and review charge costs to the same object, and one ceiling checks all of it

// the per-Scan spend ceiling, covering everything that the Scan charges during ingestion, embedding, fetch, and scoring
const SCAN_BUDGET_USD = toSpendCeiling(Bun.env.SCAN_BUDGET_USD)

// the configured ceiling as a usable number with a default
function toSpendCeiling(configuredCeiling: string | undefined): number {
	const ceiling = Number(configuredCeiling ?? "0.5")
	if (!Number.isFinite(ceiling) || ceiling < 0) {
		throw new Error(`SCAN_BUDGET_USD must be a number of dollars, zero or more. got: ${configuredCeiling}`)
	}
	return ceiling
}

// the approximate ceiling on how many resources one Scan can score, bounding the paid fetch-and-scoring section.
// it is checked before dispatch, so concurrency can overshoot it slightly. an environment variable can override it
const MAX_SCORED_RESOURCES_PER_SCAN = Number(Bun.env.MAX_SCORED_RESOURCES_PER_SCAN ?? "30")

// best-effort dollar rates for the soft cap and the per-stage breakdown. LiteLLM meters the authoritative spend
export const EMBED_COST_PER_MILLION_TOKENS = 0.1
export const CHEAP_COST_PER_MILLION_TOKENS = 0.2
export const PREMIUM_COST_PER_MILLION_TOKENS = 0.6
export const FIRECRAWL_COST_PER_FETCH = 0.001

// a chat turn's rates, one for the reply's tokens and one for each live web search the turn runs
export const CHAT_COST_PER_MILLION_TOKENS = 0.6
export const EXA_COST_PER_SEARCH = 0.005

// the per-stage dollar breakdown recorded on the Scan. ingestion is charged at a fixed rate based on the source before review
export type StageCosts = {
	ingestion: number
	embedding: number
	fetch: number
	scoringCheap: number
	scoringPremium: number
}

// the fetch outcome for one Resource: content reused within the ttl, revalidated by a 304, or freshly fetched
export type FetchOutcome = "reused" | "revalidated" | "fetched"
export type FetchOutcomeCounts = { reusedCount: number; revalidatedCount: number; fetchedCount: number }

// the running budget for an entire Scan: what it has spent against its ceiling,
// the per-stage breakdown, how many resources it may score, and its fetch counts
export type Budget = {
	spent: number
	cap: number
	stageCosts: StageCosts
	maxScoredResources: number
	fetchCounts: FetchOutcomeCounts
}

/**
 * A fresh budget at this Scan's configured ceilings, with every total at zero.
 */
export function newBudget(): Budget {
	return {
		spent: 0,
		cap: SCAN_BUDGET_USD,
		stageCosts: emptyStageCosts(),
		maxScoredResources: MAX_SCORED_RESOURCES_PER_SCAN,
		fetchCounts: emptyFetchCounts(),
	}
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
 * Whether paid tasks may still run because the Scan is under its spend ceiling.
 */
export function canSpend(budget: Budget): boolean {
	return budget.spent < budget.cap
}

/**
 * Whether a Resource may still be scored because the Scan is under both its dollar and scored-resource ceilings.
 */
export function canScoreResource(budget: Budget): boolean {
	return budget.spent < budget.cap && scoredResourcesCount(budget) < budget.maxScoredResources
}

// how many Resources the Scan has scored so far
function scoredResourcesCount(budget: Budget): number {
	return budget.fetchCounts.reusedCount + budget.fetchCounts.revalidatedCount + budget.fetchCounts.fetchedCount
}

/**
 * The count field that a fetch outcome increments
 */
export function toFetchCountField(fetchOutcome: FetchOutcome): keyof FetchOutcomeCounts {
	// each outcome has exactly one count, so a new outcome fails to compile until its count exists
	const countKeys: Record<FetchOutcome, keyof FetchOutcomeCounts> = {
		reused: "reusedCount",
		revalidated: "revalidatedCount",
		fetched: "fetchedCount",
	}
	return countKeys[fetchOutcome]
}

// a per-stage breakdown starting at zero, which each stage adds its own spend to
function emptyStageCosts(): StageCosts {
	return { ingestion: 0, embedding: 0, fetch: 0, scoringCheap: 0, scoringPremium: 0 }
}

// fetch counts starting at zero, which each fetch adds its own outcome to
function emptyFetchCounts(): FetchOutcomeCounts {
	return { reusedCount: 0, revalidatedCount: 0, fetchedCount: 0 }
}

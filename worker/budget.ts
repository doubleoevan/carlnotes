// what one Scan may spend and what it has spent. created before ingestion and updated through every stage,
// ingest and review charge costs to the same object, and one limit checks all of it

// the per-Scan spend limit, covering everything that the Scan charges during ingestion, embedding, fetch, and scoring
const SCAN_BUDGET_USD = toSpendLimit(Bun.env.SCAN_BUDGET_USD)

// the configured limit as a usable number with a default
function toSpendLimit(configuredLimit: string | undefined): number {
	const limit = Number(configuredLimit ?? "0.5")
	if (!Number.isFinite(limit) || limit < 0) {
		throw new Error(`SCAN_BUDGET_USD must be a number of dollars, zero or more. got: ${configuredLimit}`)
	}
	return limit
}

// the approximate limit on how many resources one Scan can score, bounding the paid fetch-and-scoring section.
// it is checked before dispatch, so concurrency can overshoot it slightly. an environment variable can override it
const MAX_SCORED_RESOURCES_PER_SCAN = Number(Bun.env.MAX_SCORED_RESOURCES_PER_SCAN ?? "30")

// best-effort dollar rates for the soft limit and the per-stage breakdown. LiteLLM meters the authoritative spend
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

// the running budget for an entire Scan: what it has spent against its limit,
// the per-stage breakdown, how many resources it may score, and its fetch counts
export type Budget = {
	spentDollars: number
	limitDollars: number
	stageCosts: StageCosts
	maxScoredResources: number
	fetchCounts: FetchOutcomeCounts
}

/**
 * A fresh budget at this Scan's configured limits, with every total at zero.
 */
export function newBudget(): Budget {
	return {
		spentDollars: 0,
		limitDollars: SCAN_BUDGET_USD,
		stageCosts: emptyStageCosts(),
		maxScoredResources: MAX_SCORED_RESOURCES_PER_SCAN,
		fetchCounts: emptyFetchCounts(),
	}
}

/**
 * The budget a retried stage continues from. The counters come from the checkpoint budget that the last attempt heartbeated,
 * and the limits from a fresh budget, since limits are read from the environment and a checkpointed limit would be stale.
 * A checkpoint that is missing or malformed falls back to the budget the stage was passed.
 */
export function toResumedBudget(checkpointBudget: unknown, passedBudget: Budget): Budget {
	// a stage on its first attempt has no checkpoint, and one that cannot be read is not worth resuming from
	if (!isBudgetCheckpoint(checkpointBudget)) {
		return passedBudget
	}

	// the limits come from a fresh budget, not the checkpoint,
	// so a checkpoint cannot hand the Scan a bigger allowance than the one it started under
	const { limitDollars, maxScoredResources } = newBudget()
	return {
		spentDollars: checkpointBudget.spentDollars,
		limitDollars,
		stageCosts: checkpointBudget.stageCosts,
		maxScoredResources,
		fetchCounts: checkpointBudget.fetchCounts,
	}
}

// whether a checkpoint budget includes every counter a resumed budget reads
function isBudgetCheckpoint(checkpoint: unknown): checkpoint is Budget {
	const checkpointBudget = checkpoint as Budget | null
	return (
		typeof checkpointBudget?.spentDollars === "number" &&
		hasNumericFields(checkpointBudget.stageCosts, emptyStageCosts()) &&
		hasNumericFields(checkpointBudget.fetchCounts, emptyFetchCounts())
	)
}

// whether the value includes a number for every field that the template names. the template is the empty value itself,
// so a new counter cannot be added without this check covering it
function hasNumericFields(value: unknown, template: Record<string, number>): boolean {
	const record = value as Record<string, unknown> | null
	return (
		typeof record === "object" &&
		record !== null &&
		Object.keys(template).every((field) => typeof record[field] === "number")
	)
}

/**
 * Add a stage's estimated dollars to both its bucket and the running total.
 */
export function charge(budget: Budget, stage: keyof StageCosts, dollars: number): void {
	budget.stageCosts[stage] += dollars
	budget.spentDollars += dollars
}

/**
 * A best-effort dollar estimate from token usage. LiteLLM tracks the authoritative spend.
 */
export function tokenCost(tokens: number, ratePerMillion: number): number {
	return (tokens / 1_000_000) * ratePerMillion
}

/**
 * Whether paid tasks may still run because the Scan is under its spend limit.
 */
export function canSpend(budget: Budget): boolean {
	return budget.spentDollars < budget.limitDollars
}

/**
 * Whether a Resource may still be scored because the Scan is under both its dollar and scored-resource limits.
 */
export function canScoreResource(budget: Budget): boolean {
	return budget.spentDollars < budget.limitDollars && scoredResourcesCount(budget) < budget.maxScoredResources
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

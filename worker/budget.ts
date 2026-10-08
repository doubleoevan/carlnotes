// what one Scan may spend and what it has spent

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

// the approximate limit on how many resources one Scan can score, bounding the paid fetch-and-scoring section
const MAX_SCORED_RESOURCES_PER_SCAN = Number(Bun.env.MAX_SCORED_RESOURCES_PER_SCAN ?? "30")

// best-effort dollar rates for the soft limit and the per-stage breakdown. LiteLLM meters the authoritative spend
export const EMBED_COST_PER_MILLION_TOKENS = 0.1
export const CHEAP_COST_PER_MILLION_TOKENS = 0.2
export const PREMIUM_COST_PER_MILLION_TOKENS = 0.6
export const FIRECRAWL_COST_PER_FETCH = 0.001

// what one tweet costs to read through TwitterAPI.io, from its $0.15 per 1,000 basis
export const X_COST_PER_READ = 0.00015
export const X_COST_MINIMUM_PER_REQUEST = 0.00015

// a chat turn's rates, one for the reply's tokens and one for each live web search the turn runs
export const CHAT_COST_PER_MILLION_TOKENS = 4.0
export const EXA_COST_PER_SEARCH = 0.007

// the Gemini tiers that a speech call can run on.
// Google bills flex at half the standard price, and a flex call may wait for capacity
export type SpeechTier = "standard" | "flex"

// Google's standard speech rates in dollars per million tokens through 2026-12-31.
// Google doubles the rates on 2027-01-01
const SPEECH_INPUT_COST_PER_MILLION_TOKENS = 0.5
const SPEECH_AUDIO_COST_PER_MILLION_TOKENS = 9
const SPEECH_RATES_DOUBLE_AT = Date.UTC(2027, 0, 1)

// what a flex call's text input costs, as a multiplier on the standard rate.
// the value is what LiteLLM charges a key
const FLEX_INPUT_RATE_MULTIPLIER = 0.5

// what a flex call's audio output costs, as a multiplier on the standard rate.
// LiteLLM charges flex audio at the full rate, and Google bills flex audio at half
const FLEX_AUDIO_RATE_MULTIPLIER = 1

// one speech call to price. its tier, its text input and audio output tokens, and when it was recorded
export type SpeechCostOptions = { speechTier: SpeechTier; inputTokens: number; audioTokens: number; recordedAt?: Date }

// the per-stage dollar breakdown recorded on the Scan
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

// the running budget for an entire Scan
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
 * and the limits from a fresh budget. Limits are read from the environment, and a checkpointed one would be stale.
 * A checkpoint that is missing or malformed falls back to the budget the stage was passed.
 */
export function toResumedBudget(checkpointBudget: unknown, passedBudget: Budget): Budget {
	// a stage on its first attempt has no checkpoint, and one that cannot be read is not worth resuming from
	if (!isBudgetCheckpoint(checkpointBudget)) {
		return passedBudget
	}

	// the limits come from a fresh budget, not the checkpoint
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

// whether the value includes a number for every field that the template names
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
 * Estimates the dollars that LiteLLM charges a key for one speech call, at the tier's rates on the recording date.
 */
export function speechCost({
	speechTier,
	inputTokens,
	audioTokens,
	recordedAt = new Date(),
}: SpeechCostOptions): number {
	// price each kind of token at the standard rate, times the flex multiplier on flex, and double the total after 2027
	const dateRateMultiplier = recordedAt.getTime() >= SPEECH_RATES_DOUBLE_AT ? 2 : 1
	const isFlexTier = speechTier === "flex"
	const inputDollars =
		tokenCost(inputTokens, SPEECH_INPUT_COST_PER_MILLION_TOKENS) * (isFlexTier ? FLEX_INPUT_RATE_MULTIPLIER : 1)
	const audioDollars =
		tokenCost(audioTokens, SPEECH_AUDIO_COST_PER_MILLION_TOKENS) * (isFlexTier ? FLEX_AUDIO_RATE_MULTIPLIER : 1)
	return (inputDollars + audioDollars) * dateRateMultiplier
}

/**
 * Whether paid tasks may still run because the Scan is under its spend limit and the user has not stopped it.
 */
export function canSpend(budget: Budget, stopSignal?: AbortSignal): boolean {
	return !stopSignal?.aborted && budget.spentDollars < budget.limitDollars
}

/**
 * Whether a Resource may still be scored because the Scan is under both its dollar and scored-resource limits,
 * and the user has not stopped it. A stop is treated the same as a limit reached, so the Resources left over
 * are deferred instead of thrown away.
 */
export function canScoreResource(budget: Budget, stopSignal?: AbortSignal): boolean {
	if (stopSignal?.aborted) {
		return false
	}
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

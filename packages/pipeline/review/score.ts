// the paid stages: score each fetched Resource against the topic context with tiered models, and write its Finding

import { db } from "@carlnotes/db"
import type { PersonalSourcesReviewContext } from "@carlnotes/db/personalSourcesContext"
import { resources, type scans } from "@carlnotes/db/schema/scans"
import {
	type Budget,
	CHEAP_COST_PER_MILLION_TOKENS,
	canScoreResource,
	canSpend,
	charge,
	chargeScoringFailure,
	FIRECRAWL_COST_PER_FETCH,
	premiumModelCost,
	releaseScanSpend,
	reserveScanSpend,
	toEstimatedTokens,
	toFetchCountField,
	tokenCost,
} from "@carlnotes/models/budget"
import {
	cheapModel,
	isBudgetRejection,
	LOW_REASONING_PROVIDER_OPTIONS,
	SCORE_OUTPUT_TOKENS,
	scoreModel,
} from "@carlnotes/models/models"
// the prompt loader fetches the registry version first, falling back to the bundled markdown
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { filterPremiumPrompt, writePrompt } from "@carlnotes/models/prompts/write"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { reportError } from "@carlnotes/server/monitoring"
import { generateText, type LanguageModel, Output } from "ai"
import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"
import { settleFaviconFetches } from "../favicons"
import { toPrivateReviewError } from "../personalSources/reviewContext"
import { type PersonalSourceScore, scorePersonalSourceResource } from "../personalSources/scoreResource"
import { fetchResourceContent } from "./fetch"
import type { Resource } from "./filter"
import { upsertFinding } from "./saveFinding"
import { clampScore, isPromoted } from "./scorePolicy"
import type { TopicContext } from "./topicContext"
import { type ResourceOutcome, type ReviewOutcome, trackOutcomes } from "./track"

// how many resources the paid fetch-and-scoring section works concurrently
const REVIEW_CONCURRENCY = toPositiveInteger(Bun.env.REVIEW_CONCURRENCY, 4)

// the text limit that bounds scoring tokens and spend
const MAX_SCORE_CHARS = 8000

// the score prompt's largest input beside the content, in characters: the template and the topic's score context,
// and the largest output one score writes in tokens, a score and its relevance explanation
const MAX_SCORE_TOPIC_CONTEXT_CHARS = 32_000
const MAX_SCORE_PROMPT_CHARS = 48_000
const MAX_SCORE_OUTPUT_TOKENS = SCORE_OUTPUT_TOKENS

// the largest cost of one Resource's paid section: a paid fetch, then a cheap and a premium score of the largest prompt
const MAX_SCORE_TOKENS = toEstimatedTokens(MAX_SCORE_PROMPT_CHARS) + MAX_SCORE_OUTPUT_TOKENS
export const MAX_SCORED_RESOURCE_DOLLARS =
	FIRECRAWL_COST_PER_FETCH +
	tokenCost(MAX_SCORE_TOKENS, CHEAP_COST_PER_MILLION_TOKENS) +
	premiumModelCost({ inputTokens: MAX_SCORE_TOKENS - MAX_SCORE_OUTPUT_TOKENS, outputTokens: MAX_SCORE_OUTPUT_TOKENS })

// the model's structured output. a missing safety judgment reads as safe
const scoreSchema = z.object({
	score: z.number(),
	relevanceExplanation: z.string().optional(),
	isUnsafe: z.boolean().optional(),
})

// what one scoring tier returns: the clamped score, the relevance explanation, and whether the content is unsafe
type ScoredResource = {
	score: number
	relevanceExplanation: string
	isUnsafe: boolean
	annotations?: PersonalSourceScore["annotations"]
}

// an empty public evidence selection settles this link without producing a Finding or retrying the paid call
function toScoreRejection(
	score: ScoredResource,
	needsPublicEvidence: boolean,
): Extract<ResourceOutcome, { status: "filtered" }> | null {
	if (score.isUnsafe) {
		return { status: "filtered", reason: "unsafe content" }
	}
	return needsPublicEvidence && !score.relevanceExplanation.trim()
		? { status: "filtered", reason: "below relevance threshold" }
		: null
}

// a persisted Scan record
type Scan = typeof scans.$inferSelect

// a scoring tier holds its model, its cost bucket and rate, and whether it writes the relevance explanation
type ScoreTier = {
	model: LanguageModel
	stage: "scoringCheap" | "scoringPremium"
	shouldWriteRelevanceExplanation: boolean
}

/**
 * Fetch and score the Resources concurrently, writing a Finding for each one that gets bought.
 */
export async function fetchAndScoreResources(
	resourcesToScore: Resource[],
	scan: Scan,
	topicId: string,
	topicContext: TopicContext,
	reviewOutcome: ReviewOutcome,
	budget: Budget,
	customSourceUrls: ReadonlySet<string>,
	litellmApiKey?: string,
	stopSignal?: AbortSignal,
): Promise<string[]> {
	// each Resource reserves its largest cost before it starts
	const paidOutcomes = await runWithConcurrency(resourcesToScore, REVIEW_CONCURRENCY, async (resource) => {
		// settle only completed review decisions, preserving failed and budget-deferred queue work
		const outcome = await fetchAndScoreResource(
			resource,
			scan,
			topicId,
			topicContext,
			budget,
			customSourceUrls,
			litellmApiKey,
			stopSignal,
		)
		if (outcome.status === "kept" || outcome.status === "filtered") {
			await reviewOutcome.onResourceConsidered?.(resource.url, {
				reviewOutcome: outcome.status === "filtered" && outcome.reason === "no text to score" ? "rejected" : "scored",
				...(outcome.status === "filtered" ? { reviewReason: outcome.reason } : {}),
			})
		}
		return outcome
	})
	for (const paidOutcome of paidOutcomes) {
		trackOutcomes(reviewOutcome, paidOutcome)
	}

	// the icons fetched beside the scores are stored before the stage ends
	await settleFaviconFetches()

	// the Resources this stage scored, which the limit did not defer
	return resourcesToScore
		.filter((_, index) => paidOutcomes[index]?.status !== "deferred")
		.map((resource) => resource.id)
}

// the paid stages for one Resource: fetch its content, score it, and write the Finding
async function fetchAndScoreResource(
	resource: Resource,
	scan: Scan,
	topicId: string,
	topicContext: TopicContext,
	budget: Budget,
	customSourceUrls: ReadonlySet<string>,
	litellmApiKey?: string,
	stopSignal?: AbortSignal,
): Promise<ResourceOutcome> {
	// defer the Resource once the Scan hits its scored-resource limit, once its spent and reserved dollars reach the
	// dollar limit, or once the user stops the Scan
	const reservedDollars = toScoredResourceReservation(topicContext.personalSources?.length ?? 0)
	if (!canScoreResource(budget, stopSignal) || !reserveScanSpend(budget, reservedDollars)) {
		return { status: "deferred" }
	}

	let reviewStage: "fetch" | "score" | "save" = "fetch"
	try {
		// get the content by reuse, revalidation, or a paid fetch, then increment the FetchOutcome
		const { content, fetchOutcome } = await fetchResourceContent(resource, budget)
		budget.fetchCounts[toFetchCountField(fetchOutcome)]++

		// a Resource that resolved to no text at all, an episode with no transcript and no show notes, is dropped here
		if (!content.trim()) {
			return { status: "filtered", reason: "no text to score" }
		}

		// score the content, then drop a Resource that a scoring call judged unsafe without writing its Finding
		reviewStage = "score"
		const scoredResource = await scoreResource(
			content,
			topicContext.scoreText,
			budget,
			litellmApiKey,
			topicContext.personalSources,
		)
		if (!topicContext.personalSourcesVersions) {
			await markResourceSafety(resource.id, scoredResource.isUnsafe)
		}
		const rejection = toScoreRejection(scoredResource, Boolean(topicContext.personalSources?.length))
		if (rejection) {
			return rejection
		}
		reviewStage = "save"
		const upsertFindingResult = await upsertFinding({
			scan,
			topicId,
			resource,
			score: scoredResource.score,
			relevanceExplanation: scoredResource.relevanceExplanation,
			topicContextHash: topicContext.contextHash,
			isFromCustomSource: customSourceUrls.has(resource.url),
			personalSourceScoreBonus: resource.personalSourceScoreBonus,
			personalSources: topicContext.personalSources,
			annotations: scoredResource.annotations,
		})

		// the kept outcome includes the feed-facing details that the report cites
		const keptFinding = {
			title: resource.title,
			url: resource.url,
			// the stored score with its source bonus and the explanation from the scoring call
			relevanceScore: upsertFindingResult.relevanceScore,
			relevanceExplanation: scoredResource.relevanceExplanation,
			isNew: upsertFindingResult.isNew,
		}
		return { status: "kept", finding: keptFinding }
	} catch (error) {
		// a spent budget ends the whole Scan. every Resource left would meet the same rejection
		if (isBudgetRejection(error)) {
			if (topicContext.personalSourcesVersions) {
				throw toPrivateReviewError(error)
			}
			throw error
		}

		// private model failures cannot expose their request through logs or monitoring
		const reviewError = topicContext.personalSourcesVersions
			? new Error(`${toPrivateReviewError(error).message} (${reviewStage})`)
			: error
		// this Resource was paid for and produced nothing, so it is worth alerting on
		console.error(`review failed for resource ${resource.id}`, reviewError)
		reportError(reviewError, "score", { resourceId: resource.id, url: resource.url })
		return { status: "failed" }
	} finally {
		// what the Resource spent was charged as it ran, so its reservation ends however the paid section ended
		releaseScanSpend(budget, reservedDollars)
	}
}

/**
 * Reserves one Resource's largest cost inside the Scan's budget and returns true, or returns false once the Scan's
 * scored-resource limit is reached, its spent and reserved dollars reach its dollar limit, or the user stops it.
 * A true result is released with releaseScanSpend once the Resource's paid section ends.
 */
export function reserveScoredResource(budget: Budget, stopSignal?: AbortSignal): boolean {
	return canScoreResource(budget, stopSignal) && reserveScanSpend(budget, MAX_SCORED_RESOURCE_DOLLARS)
}

/**
 * Score resource content with the cheap model first, promoting only the best to the premium model for the final score and relevance explanation.
 */
export async function scoreResource(
	resourceContent: string,
	topicContext: string,
	budget: Budget,
	litellmApiKey?: string,
	personalSources?: PersonalSourcesReviewContext[],
): Promise<ScoredResource> {
	if (personalSources?.length) {
		if (!litellmApiKey) {
			throw new Error("Private review requires the Topic Scan billing key")
		}
		return scorePersonalSourceResource({ resourceContent, topicContext, budget, litellmApiKey, personalSources })
	}
	// the cheap model scores everything fetched first
	const cheapTier: ScoreTier = {
		model: cheapModel(litellmApiKey),
		stage: "scoringCheap",
		shouldWriteRelevanceExplanation: false,
	}
	const cheapOutcome = await scoreResourceContent(cheapTier, resourceContent, topicContext, budget)

	// unsafe content ends here, and only Resources with a high enough cheap model score earn a premium model re-score
	// and only while the Scan can spend
	if (cheapOutcome.isUnsafe || !isPromoted(cheapOutcome.score) || !canSpend(budget)) {
		return cheapOutcome
	}

	// the premium model writes the final score and adds the relevance explanation
	const premiumTier: ScoreTier = {
		model: scoreModel(litellmApiKey),
		stage: "scoringPremium",
		// the user-facing note comes only from this tier
		shouldWriteRelevanceExplanation: true,
	}
	return scoreResourceContent(premiumTier, resourceContent, topicContext, budget)
}

// a scoring call through LiteLLM structured output, adding its estimated cost to the budget
async function scoreResourceContent(
	scoreTier: ScoreTier,
	resourceContent: string,
	topicContext: string,
	budget: Budget,
): Promise<ScoredResource> {
	// fetch and write the score prompt
	const scorePrompt = await buildScorePrompt(resourceContent, topicContext, scoreTier.shouldWriteRelevanceExplanation)

	// structured output forces a numeric score. the relevance explanation is only asked for on the premium tier
	const generated = await generateText({
		model: scoreTier.model,
		maxOutputTokens: MAX_SCORE_OUTPUT_TOKENS,
		maxRetries: 0,
		...(scoreTier.stage === "scoringPremium" ? { providerOptions: LOW_REASONING_PROVIDER_OPTIONS } : {}),
		output: Output.object({ schema: scoreSchema }),
		prompt: scorePrompt.prompt,
		...promptTelemetry(scorePrompt),
	}).catch((error: unknown) => chargeScoringFailure(budget, scoreTier.stage, error))

	// track the estimated cost, then return the clamped score, the relevance explanation the cheap model leaves, and
	// the safety judgment
	charge(
		budget,
		scoreTier.stage,
		scoreTier.stage === "scoringPremium"
			? premiumModelCost(generated.usage)
			: tokenCost(generated.usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS),
	)
	const output = generated.output
	return {
		score: clampScore(output.score),
		relevanceExplanation: output.relevanceExplanation ?? "",
		isUnsafe: output.isUnsafe ?? false,
	}
}

// record whether a Resource's content was judged unsafe, so a safe score clears an earlier mark. a row that already
// holds the judgment is not written again
async function markResourceSafety(resourceId: string, isUnsafe: boolean): Promise<void> {
	await db
		.update(resources)
		.set({ isUnsafe })
		.where(and(eq(resources.id, resourceId), ne(resources.isUnsafe, isUnsafe)))
}

/**
 * Build the scoring prompt from summarize-resource.md. The relevance explanation is only requested from the premium tier model.
 */
export async function buildScorePrompt(
	resourceContent: string,
	topicContext: string,
	shouldWriteRelevanceExplanation: boolean,
): Promise<BuiltPrompt> {
	// fetch the registry version first
	const { template, name, registryPrompt } = await fetchPromptTemplate("summarize-resource")

	// the cheap tier drops the premium-tier wording, then the content is limited to bound tokens and spend
	const scoreTemplate = shouldWriteRelevanceExplanation ? template : filterPremiumPrompt(template)
	const prompt = writePrompt(scoreTemplate, {
		topicContext: topicContext.slice(0, MAX_SCORE_TOPIC_CONTEXT_CHARS),
		resourceContent: resourceContent.slice(0, MAX_SCORE_CHARS),
	})
	if (prompt.length > MAX_SCORE_PROMPT_CHARS) {
		throw new Error("Scoring prompt exceeds its reserved input limit")
	}
	return { prompt, name, registryPrompt }
}

// reserve bounded prompt input and one annotation output allowance for each sender
function toScoredResourceReservation(senderCount: number): number {
	if (senderCount === 0) {
		return MAX_SCORED_RESOURCE_DOLLARS
	}
	return (
		FIRECRAWL_COST_PER_FETCH +
		senderCount * premiumModelCost({ inputTokens: 30_000, outputTokens: SCORE_OUTPUT_TOKENS })
	)
}

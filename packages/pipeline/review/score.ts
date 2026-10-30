// the paid stages: score each fetched Resource against the topic context with tiered models, and write its Finding

import { db } from "@carlnotes/db"
import { findings, resources, type scans } from "@carlnotes/db/schema/scans"
import {
	type Budget,
	CHEAP_COST_PER_MILLION_TOKENS,
	canScoreResource,
	canSpend,
	charge,
	FIRECRAWL_COST_PER_FETCH,
	PREMIUM_COST_PER_MILLION_TOKENS,
	releaseScanSpend,
	reserveScanSpend,
	type StageCosts,
	toEstimatedTokens,
	toFetchCountField,
	tokenCost,
} from "@carlnotes/models/budget"
import { cheapModel, isBudgetRejection, scoreModel } from "@carlnotes/models/models"
// the prompt loader fetches the registry version first, falling back to the bundled markdown
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { filterPremiumPrompt, writePrompt } from "@carlnotes/models/prompts/write"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { reportError } from "@carlnotes/server/monitoring"
import { generateText, type LanguageModel, Output } from "ai"
import { and, eq, ne, sql } from "drizzle-orm"
import { z } from "zod"
import { settleFaviconFetches } from "../favicons"
import { linkPodcastEpisodeChapters, toPodcastEpisodeChapterRatingSql } from "../podcast/podcastEpisodeChapters"
import { fetchResourceContent } from "./fetch"
import type { Resource, TopicContext } from "./filter"
import { type ResourceOutcome, type ReviewOutcome, trackOutcomes } from "./track"

// the cheap model score that earns a premium model re-score and a relevance explanation. the environment can override it
const REVIEW_PROMOTION_THRESHOLD = Number(Bun.env.REVIEW_PROMOTION_THRESHOLD ?? "0.6")

// what a finding that a custom Source found adds to its relevance score. the user chose that Source for the topic
const CUSTOM_SOURCE_SCORE_BONUS = 0.05

// how many resources the paid fetch-and-scoring section works concurrently
const REVIEW_CONCURRENCY = toPositiveInteger(Bun.env.REVIEW_CONCURRENCY, 4)

// the text limit that bounds scoring tokens and spend
const MAX_SCORE_CHARS = 8000

// the score prompt's largest input beside the content, in characters: the template and the topic's score context,
// and the largest output one score writes in tokens, a score and its relevance explanation
const MAX_SCORE_PROMPT_CHARS = 12_000
const MAX_SCORE_OUTPUT_TOKENS = 1000

// the largest cost of one Resource's paid section: a paid fetch, then a cheap and a premium score of the largest prompt
const MAX_SCORE_TOKENS = toEstimatedTokens(MAX_SCORE_CHARS + MAX_SCORE_PROMPT_CHARS) + MAX_SCORE_OUTPUT_TOKENS
export const MAX_SCORED_RESOURCE_DOLLARS =
	FIRECRAWL_COST_PER_FETCH +
	tokenCost(MAX_SCORE_TOKENS, CHEAP_COST_PER_MILLION_TOKENS) +
	tokenCost(MAX_SCORE_TOKENS, PREMIUM_COST_PER_MILLION_TOKENS)

// the model's structured output. a missing safety judgment reads as safe
const scoreSchema = z.object({
	score: z.number(),
	relevanceExplanation: z.string().optional(),
	isUnsafe: z.boolean().optional(),
})

// what one scoring tier returns: the clamped score, the relevance explanation, and whether the content is unsafe
type ScoredResource = { score: number; relevanceExplanation: string; isUnsafe: boolean }

// a persisted Scan record
type Scan = typeof scans.$inferSelect

// a scoring tier holds its model, its cost bucket and rate, and whether it writes the relevance explanation
type ScoreTier = {
	model: LanguageModel
	stage: keyof StageCosts
	ratePerMillion: number
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
	const paidOutcomes = await runWithConcurrency(resourcesToScore, REVIEW_CONCURRENCY, (resource) =>
		fetchAndScoreResource(resource, scan, topicId, topicContext, budget, customSourceUrls, litellmApiKey, stopSignal),
	)
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
	if (!reserveScoredResource(budget, stopSignal)) {
		return { status: "deferred" }
	}

	try {
		// get the content by reuse, revalidation, or a paid fetch, then increment the FetchOutcome
		const { content, fetchOutcome } = await fetchResourceContent(resource, budget)
		budget.fetchCounts[toFetchCountField(fetchOutcome)]++

		// a Resource that resolved to no text at all, an episode with no transcript and no show notes, is dropped here
		if (!content.trim()) {
			return { status: "filtered", reason: "no text to score" }
		}

		// score the content, then drop a Resource that a scoring call judged unsafe without writing its Finding
		const scoredResource = await scoreResource(content, topicContext.scoreText, budget, litellmApiKey)
		await markResourceSafety(resource.id, scoredResource.isUnsafe)
		if (scoredResource.isUnsafe) {
			return { status: "filtered", reason: "unsafe content" }
		}
		const upsertFindingResult = await upsertFinding({
			scan,
			topicId,
			resource,
			score: scoredResource.score,
			relevanceExplanation: scoredResource.relevanceExplanation,
			topicContextHash: topicContext.contextHash,
			isFromCustomSource: customSourceUrls.has(resource.url),
		})

		// the kept outcome includes the feed-facing details that the report cites
		const keptFinding = {
			title: resource.title,
			url: resource.url,
			// the stored score, with any custom Source bonus, and the note from the tiered scoring call
			relevanceScore: upsertFindingResult.relevanceScore,
			relevanceExplanation: scoredResource.relevanceExplanation,
			isNew: upsertFindingResult.isNew,
		}
		return { status: "kept", finding: keptFinding }
	} catch (error) {
		// a spent budget ends the whole Scan. every Resource left would meet the same rejection
		if (isBudgetRejection(error)) {
			throw error
		}
		// this Resource was paid for and produced nothing, so it is worth alerting on
		console.error(`review failed for resource ${resource.id}`, error)
		reportError(error, "score", { resourceId: resource.id, url: resource.url })
		return { status: "failed" }
	} finally {
		// what the Resource spent was charged as it ran, so its reservation ends however the paid section ended
		releaseScanSpend(budget, MAX_SCORED_RESOURCE_DOLLARS)
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
): Promise<ScoredResource> {
	// the cheap model scores everything fetched first
	const cheapTier: ScoreTier = {
		model: cheapModel(litellmApiKey),
		stage: "scoringCheap",
		ratePerMillion: CHEAP_COST_PER_MILLION_TOKENS,
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
		ratePerMillion: PREMIUM_COST_PER_MILLION_TOKENS,
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
	const { output, usage } = await generateText({
		model: scoreTier.model,
		output: Output.object({ schema: scoreSchema }),
		prompt: scorePrompt.prompt,
		...promptTelemetry(scorePrompt),
	})

	// track the estimated cost, then return the clamped score, the relevance explanation the cheap model leaves, and
	// the safety judgment
	charge(budget, scoreTier.stage, tokenCost(usage.totalTokens ?? 0, scoreTier.ratePerMillion))
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
		topicContext,
		resourceContent: resourceContent.slice(0, MAX_SCORE_CHARS),
	})
	return { prompt, name, registryPrompt }
}

// the finding columns a review writes
type FindingReviewFields = {
	scanId: string
	relevanceScore: number
	relevanceExplanation: string
	reviewedContextHash: string
	reviewedContentHash: string | null
}

/**
 * Returns the columns a re-score decides, so upserting one leaves a user's rating and view count untouched.
 */
export function toFindingReviewFields(review: {
	scanId: string
	score: number
	relevanceExplanation: string
	topicContextHash: string
	contentHash: string | null
}): FindingReviewFields {
	return {
		scanId: review.scanId,
		relevanceScore: review.score,
		relevanceExplanation: review.relevanceExplanation,
		reviewedContextHash: review.topicContextHash,
		reviewedContentHash: review.contentHash,
	}
}

// the scan, topic, and resource a finding belongs to, the review it records, and whether a custom Source found it
type UpsertFindingOptions = {
	scan: Scan
	topicId: string
	resource: Resource
	score: number
	relevanceExplanation: string
	topicContextHash: string
	// whether a custom Source found the resource in this Scan
	isFromCustomSource: boolean
}

// whether the upsert added the finding to the topic, and the relevance score that it stored
type UpsertFindingResult = { isNew: boolean; relevanceScore: number }

/**
 * Upserts one finding per topic and resource, and returns whether the finding is new and the score that it stored.
 * The scan that found the finding is written on the insert alone, and a re-score updates the review columns.
 */
export async function upsertFinding({
	scan,
	topicId,
	resource,
	score,
	relevanceExplanation,
	topicContextHash,
	isFromCustomSource,
}: UpsertFindingOptions): Promise<UpsertFindingResult> {
	// build the whole of what a re-score may change
	const review = toFindingReviewFields({
		scanId: scan.id,
		score,
		relevanceExplanation,
		topicContextHash,
		contentHash: resource.contentHash,
	})

	// a finding that a custom Source found, in this Scan or an earlier one, gets the score bonus on every re-score
	const insertedScore = isFromCustomSource ? clampScore(score + CUSTOM_SOURCE_SCORE_BONUS) : score
	const isFromCustomSourceSql = sql<boolean>`(${findings.isFromCustomSource} or ${isFromCustomSource}::boolean)`
	const customSourceBonusSql = sql`case when ${isFromCustomSourceSql} then ${CUSTOM_SOURCE_SCORE_BONUS}::real else 0 end`
	const updatedScoreSql = sql<number>`least(1, ${score}::real + ${customSourceBonusSql})`

	// upsert the topic finding. postgres returns xmax as zero for an inserted row and non-zero for an updated row
	const topicResourceRef = { topicId, resourceId: resource.id }
	const [findingRow] = await db
		.insert(findings)
		// the finding includes the relevance score and explanation, the scan that produced them and first found the
		// finding, and a chapter's rating
		.values({
			...topicResourceRef,
			...review,
			foundScanId: scan.id,
			relevanceScore: insertedScore,
			isFromCustomSource,
			rating: toPodcastEpisodeChapterRatingSql(topicResourceRef),
		})
		// a re-score hits the topic and resource unique constraint, so update that row in place. the scan that first
		// found the finding stays
		.onConflictDoUpdate({
			target: [findings.topicId, findings.resourceId],
			set: { ...review, relevanceScore: updatedScoreSql, isFromCustomSource: isFromCustomSourceSql },
		})
		.returning({ id: findings.id, isNew: sql<boolean>`(xmax = 0)`, relevanceScore: findings.relevanceScore })

	// link a new finding to the chapters that narrated its resource
	if (findingRow?.isNew) {
		await linkPodcastEpisodeChapters({ ...topicResourceRef, findingId: findingRow.id })
	}
	return { isNew: findingRow?.isNew ?? false, relevanceScore: findingRow?.relevanceScore ?? insertedScore }
}

/**
 * Whether a cheap model score is high enough to earn a premium model re-score.
 */
export function isPromoted(score: number): boolean {
	return score >= REVIEW_PROMOTION_THRESHOLD
}

/**
 * Returns the score limited to the 0 to 1 range.
 */
export function clampScore(score: number): number {
	return Math.max(0, Math.min(1, score))
}

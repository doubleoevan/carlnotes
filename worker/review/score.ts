// the paid stages: score each fetched Resource against the topic context with tiered models, and write its Finding
import { reportError } from "@shared/monitoring"
import { generateText, type LanguageModel, Output } from "ai"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "../../db"
import { findings, type scans } from "../../db/schema/scans"
import {
	type Budget,
	CHEAP_COST_PER_MILLION_TOKENS,
	canScoreResource,
	canSpend,
	charge,
	PREMIUM_COST_PER_MILLION_TOKENS,
	type StageCosts,
	toFetchCountField,
	tokenCost,
} from "../budget"
import { runWithConcurrency } from "../concurrency"
import { settleFaviconFetches } from "../favicons"
import { screenText, toFlaggedReason } from "../guard"
import { cheapModel, isBudgetRejection, scoreModel } from "../models"
import { linkPodcastEpisodeChapters, toPodcastEpisodeChapterRatingSql } from "../podcast/podcastEpisodeChapters"
// the prompt loader fetches the registry version first, falling back to the bundled markdown
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "../prompts/fetch"
import { filterPremiumPrompt, writePrompt } from "../prompts/write"
import { fetchResourceContent } from "./fetch"
import type { Resource, TopicContext } from "./filter"
import { type ResourceOutcome, type ReviewOutcome, trackOutcomes } from "./track"

// the cheap model score that earns a premium model re-score and a relevance explanation. the environment can override it
const REVIEW_PROMOTION_THRESHOLD = Number(Bun.env.REVIEW_PROMOTION_THRESHOLD ?? "0.6")

// what a finding that a custom Source found adds to its relevance score. the user chose that Source for the topic
const CUSTOM_SOURCE_SCORE_BONUS = 0.05

// how many resources the paid fetch-and-scoring section works concurrently
const REVIEW_CONCURRENCY = Number(Bun.env.REVIEW_CONCURRENCY ?? "4")

// the text limit that bounds scoring tokens and spend
const MAX_SCORE_CHARS = 8000

// the model's structured output
const scoreSchema = z.object({ score: z.number(), relevanceExplanation: z.string().optional() })

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
	// each Resource checks the limit before it starts
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
	// defer the Resource once the Scan hits its dollar limit or its scored-resource limit, or once the user stops the Scan
	if (!canScoreResource(budget, stopSignal)) {
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

		// screen the fetched page before any model reads it
		const screenVerdict = await screenText(content.slice(0, MAX_SCORE_CHARS), "page")
		if (screenVerdict.isFlagged) {
			console.error(`resource ${resource.id} ${toFlaggedReason(screenVerdict)}`)
			return { status: "filtered", reason: "flagged by scanner" }
		}

		// score the scanner's text, not the original, so any personal details it redacted never reach a model
		const scoredResource = await scoreResource(screenVerdict.text, topicContext.scoreText, budget, litellmApiKey)
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
	}
}

/**
 * Score resource content with the cheap model first, promoting only the best to the premium model for the final score and relevance explanation.
 */
export async function scoreResource(
	resourceContent: string,
	topicContext: string,
	budget: Budget,
	litellmApiKey?: string,
): Promise<{ score: number; relevanceExplanation: string }> {
	// the cheap model scores everything fetched first
	const cheapTier: ScoreTier = {
		model: cheapModel(litellmApiKey),
		stage: "scoringCheap",
		ratePerMillion: CHEAP_COST_PER_MILLION_TOKENS,
		shouldWriteRelevanceExplanation: false,
	}
	const cheapOutcome = await scoreResourceContent(cheapTier, resourceContent, topicContext, budget)

	// only Resources with a high enough cheap model score earn a premium model re-score and only while the Scan is
	if (!isPromoted(cheapOutcome.score) || !canSpend(budget)) {
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
): Promise<{ score: number; relevanceExplanation: string }> {
	// fetch and write the score prompt
	const scorePrompt = await buildScorePrompt(resourceContent, topicContext, scoreTier.shouldWriteRelevanceExplanation)

	// structured output forces a numeric score. the relevance explanation is only asked for on the premium tier
	const { output, usage } = await generateText({
		model: scoreTier.model,
		output: Output.object({ schema: scoreSchema }),
		prompt: scorePrompt.prompt,
		...promptTelemetry(scorePrompt),
	})

	// track the estimated cost, then return the clamped score and the relevance explanation the cheap model leaves
	charge(budget, scoreTier.stage, tokenCost(usage.totalTokens ?? 0, scoreTier.ratePerMillion))
	return { score: clampScore(output.score), relevanceExplanation: output.relevanceExplanation ?? "" }
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

// upsert one finding per topic and resource, and return whether the finding is new and the score that it stored
async function upsertFinding({
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
		// the finding includes the relevance score and explanation, the scan that produced them, and a chapter's rating
		.values({
			...topicResourceRef,
			...review,
			relevanceScore: insertedScore,
			isFromCustomSource,
			rating: toPodcastEpisodeChapterRatingSql(topicResourceRef),
		})
		// a re-score hits the topic and resource unique constraint, so update that row in place
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

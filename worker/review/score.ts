// the paid stages: fetch each admitted Resource's content, score it against the topic context with tiered
// models, and write the Finding. every Resource checks the Scan's limits before it starts
import { reportError } from "@shared/monitoring"
import { generateText, type LanguageModel, Output } from "ai"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "../../db"
import { findings, resources, type scans } from "../../db/schema"
import {
	type Budget,
	CHEAP_COST_PER_MILLION_TOKENS,
	canScoreResource,
	canSpend,
	charge,
	type FetchOutcome,
	FIRECRAWL_COST_PER_FETCH,
	PREMIUM_COST_PER_MILLION_TOKENS,
	type StageCosts,
	toFetchCountField,
	tokenCost,
} from "../budget"
import { screenText, toFlaggedReason } from "../guard"
import { cheapModel, scoreModel } from "../models"
// the prompt loader fetches the registry version first, falling back to the bundled markdown
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "../prompts/fetch"
import { filterPremiumPrompt, writePrompt } from "../prompts/write"
import { CONTENT_TTL_MS, fetchContent, isContentStale, revalidateContent } from "../scrape"
import { deleteResourceContent, getResourceContent, toResourceContentKey, uploadResourceContent } from "../store"
import type { Resource, TopicContext } from "./filter"
import { type ResourceOutcome, type ReviewOutcome, trackOutcomes } from "./track"

// the cheap model score that earns a premium model re-score and a relevance explanation. the environment can override it
const REVIEW_PROMOTION_THRESHOLD = Number(Bun.env.REVIEW_PROMOTION_THRESHOLD ?? "0.6")

// stored resource content stays reusable for this long before a scan revalidates or refetches it. the environment can override it

// how many resources the paid fetch-and-scoring section works concurrently. it stays bounded because Firecrawl
// enforces a per-plan concurrency and responds to a burst with 429s, which fall back to the snippet.
// the environment can override it, and a value of 1 restores the original serial behavior
const REVIEW_CONCURRENCY = Number(Bun.env.REVIEW_CONCURRENCY ?? "4")

// the text cap that bounds scoring tokens and spend
const MAX_SCORE_CHARS = 8000

// the model's structured output. a relevance score from 0 to 1, plus a relevance explanation that only the premium model is asked to write
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
 * Fetch and score the admitted Resources concurrently, writing a Finding for each one that gets bought.
 */
export async function fetchAndScoreResources(
	admittedResources: Resource[],
	scan: Scan,
	topicId: string,
	topicContext: TopicContext,
	reviewOutcome: ReviewOutcome,
	budget: Budget,
	litellmApiKey?: string,
): Promise<string[]> {
	// each Resource checks the limit before it starts, so work already in flight when the limit is reached
	// can overshoot it by up to one less than the concurrency. that overshoot is accepted, and costs a few cents
	const paidOutcomes = await runWithConcurrency(admittedResources, REVIEW_CONCURRENCY, (resource) =>
		fetchAndScoreResource(resource, scan, topicId, topicContext, budget, litellmApiKey),
	)
	for (const paidOutcome of paidOutcomes) {
		trackOutcomes(reviewOutcome, paidOutcome)
	}

	// the Resources this stage admitted that the limit did not defer.
	// the outcomes come back by index, so a Resource is matched to its own outcome
	return admittedResources
		.filter((_, index) => paidOutcomes[index]?.status !== "deferred")
		.map((resource) => resource.id)
}

/**
 * Runs one task per item with at most `maxConcurrency` of them in flight, returning the results by item index.
 */
export async function runWithConcurrency<Item, Result>(
	items: Item[],
	maxConcurrency: number,
	runFunction: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
	// one shared cursor hands the next index to whichever worker is free, so slots refill as work finishes
	const results: Result[] = new Array(items.length)
	let nextIndex = 0
	async function runWorker(): Promise<void> {
		while (nextIndex < items.length) {
			const index = nextIndex++
			// the cursor already moved, so this index is this worker's alone
			const item = items[index] as Item
			results[index] = await runFunction(item, index)
		}
	}

	// never start more workers than there is work, and never fewer than one
	const workerCount = Math.max(1, Math.min(maxConcurrency, items.length))
	await Promise.all(Array.from({ length: workerCount }, runWorker))
	return results
}

// the paid stages for one admitted Resource: fetch its content, score it, and write the Finding.
// failures are isolated here too, so one bad Resource never aborts the others in flight
async function fetchAndScoreResource(
	resource: Resource,
	scan: Scan,
	topicId: string,
	topicContext: TopicContext,
	budget: Budget,
	litellmApiKey?: string,
): Promise<ResourceOutcome> {
	// defer the Resource once the Scan hits its dollar limit or its scored-resource limit
	if (!canScoreResource(budget)) {
		return { status: "deferred" }
	}

	try {
		// get the content by reuse, revalidation, or a paid fetch, then increment the FetchOutcome, which advances the scored-resource count
		const { content, fetchOutcome } = await fetchResourceContent(resource, budget)
		budget.fetchCounts[toFetchCountField(fetchOutcome)]++

		// screen the fetched page before any model reads it. a flagged page is dropped under its own cause and never scored
		const screenVerdict = await screenText(content, "page")
		if (screenVerdict.isFlagged) {
			console.error(`resource ${resource.id} ${toFlaggedReason(screenVerdict)}`)
			return { status: "filtered", reason: "flagged by scanner" }
		}

		// score the scanner's text, not the original, so any personal details it redacted never reach a model
		const scoredResource = await scoreResource(screenVerdict.text, topicContext.text, budget, litellmApiKey)
		await upsertFinding(scan, topicId, resource, scoredResource.score, scoredResource.relevanceExplanation)

		// the kept outcome carries the feed-facing details that the report cites
		const keptFinding = {
			title: resource.title,
			url: resource.url,
			// the score and note come from the tiered scoring call
			relevanceScore: scoredResource.score,
			relevanceExplanation: scoredResource.relevanceExplanation,
		}
		return { status: "kept", finding: keptFinding }
	} catch (error) {
		// this Resource was paid for and produced nothing, so it is worth alerting on
		console.error(`review failed for resource ${resource.id}`, error)
		reportError(error, "score", { resourceId: resource.id, url: resource.url })
		return { status: "failed" }
	}
}

// get the survivor's content: reuse it if fresh, revalidate stale content with a cheap conditional GET, else fetch from Firecrawl.
// reuse and a 304 cost no fetch credit. only the Firecrawl fetch is billed, and a failed fetch falls back to the snippet
async function fetchResourceContent(
	resource: Resource,
	budget: Budget,
): Promise<{ content: string; fetchOutcome: FetchOutcome }> {
	// reuse stored content scores as-is if it isn't stale, read back from object storage, with no fetch
	if (resource.contentKey && !isContentStale(resource.fetchedAt, new Date(), CONTENT_TTL_MS)) {
		const storedContent = await readStoredContent(resource.contentKey, resource.id)
		if (storedContent !== null) {
			return { content: storedContent, fetchOutcome: "reused" }
		}
	}

	// revalidate stale content with a cheap conditional GET. 304 reuses it and refreshes the fetched_at timestamp
	if (resource.contentKey && (resource.etag || resource.lastModified)) {
		const outcome = await revalidateContent(resource.url, { etag: resource.etag, lastModified: resource.lastModified })
		const storedContent = outcome === "not-modified" ? await readStoredContent(resource.contentKey, resource.id) : null
		if (storedContent !== null) {
			await db.update(resources).set({ fetchedAt: new Date() }).where(eq(resources.id, resource.id))
			return { content: storedContent, fetchOutcome: "revalidated" }
		}
	}

	// fetch with a billed Firecrawl, storing fresh content and the etag and last-modified
	return fetchViaFirecrawl(resource, budget)
}

// read a Resource's stored Markdown or null when the object is gone or unreadable.
// a missing object is a cache miss, not a Resource failure, so the caller falls through and fetches the page again
async function readStoredContent(contentKey: string, resourceId: string): Promise<string | null> {
	try {
		return await getResourceContent(contentKey)
	} catch (error) {
		// a read that fails turns into a paid refetch, so a rising rate here costs money
		console.error(`object-storage read failed for resource ${resourceId}`, error)
		reportError(error, "object-storage", { resourceId, contentKey, operation: "read" })
		return null
	}
}

// fetch the content from Firecrawl, write it to object storage, and record its key, size, and validators on the resource row.
// a failed scrape or a failed object-storage write falls back to the native snippet, never failing the Resource or the Scan
async function fetchViaFirecrawl(
	resource: Resource,
	budget: Budget,
): Promise<{ content: string; fetchOutcome: FetchOutcome }> {
	try {
		// fetch the page Markdown, charge the scrape, then write the body to object storage
		const { markdown, etag, lastModified } = await fetchContent(resource.url)
		charge(budget, "fetch", FIRECRAWL_COST_PER_FETCH)
		const stored = markdown ? await storeResourceContent(resource.id, markdown) : null

		// decide the text to score and the key to store, then store the resource row
		const { scoringText, contentKey, contentBytes } = toFetchedContentFields(stored, markdown, resource.snippet)
		await db
			.update(resources)
			.set({ contentKey, contentBytes, etag, lastModified, fetchedAt: new Date() })
			.where(eq(resources.id, resource.id))
		return { content: scoringText, fetchOutcome: "fetched" }
	} catch (error) {
		// the fetch failed, so fall back to the snippet. the Finding is still written, with less to go on
		console.error(`firecrawl fetch failed for ${resource.url}`, error)
		reportError(error, "fetch", { resourceId: resource.id, url: resource.url })
		return { content: resource.snippet ?? "", fetchOutcome: "fetched" }
	}
}

// write the fetched Markdown to object storage, returning its key and size, or null when the write fails.
// a failed write best-effort deletes the object so it leaves no orphan, and review falls back to the snippet
async function storeResourceContent(
	resourceId: string,
	markdown: string,
): Promise<{ contentKey: string; bytes: number } | null> {
	try {
		return await uploadResourceContent(resourceId, markdown)
	} catch (error) {
		// the write failed. delete any partial object, then return null so scoring falls back to the snippet.
		// nothing is stored, so a later Scan refetches this page
		console.error(`object-storage write failed for resource ${resourceId}`, error)
		reportError(error, "object-storage", { resourceId, operation: "write" })
		await deleteResourceContent(toResourceContentKey(resourceId)).catch(() => {})
		return null
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

	// only Resources with a high enough cheap model score earn a premium model re-score
	// and only while the Scan is still under its spend cap
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

	// track the estimated cost, then return the clamped score and the relevance explanation
	// the cheap model leaves the relevance explanation empty
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

	// the cheap tier drops the premium-tier wording, then the content is capped to bound tokens and spend.
	// both are user-supplied text, not app-generated, so they get fenced in the prompt as untrusted
	const scoreTemplate = shouldWriteRelevanceExplanation ? template : filterPremiumPrompt(template)
	const prompt = writePrompt(scoreTemplate, {
		topicContext,
		resourceContent: resourceContent.slice(0, MAX_SCORE_CHARS),
	})
	return { prompt, name, registryPrompt }
}

// upsert one finding per topic and resource. re-scoring updates the existing row instead of adding another
async function upsertFinding(
	scan: Scan,
	topicId: string,
	resource: Resource,
	score: number,
	relevanceExplanation: string,
): Promise<void> {
	// insert the topic finding
	await db
		.insert(findings)
		// the finding carries the relevance score and explanation, plus the scan that produced them
		.values({
			topicId,
			resourceId: resource.id,
			scanId: scan.id,
			relevanceScore: score,
			relevanceExplanation,
		})
		// a re-score hits the topic and resource unique constraint, so update that row in place
		.onConflictDoUpdate({
			target: [findings.topicId, findings.resourceId],
			set: { scanId: scan.id, relevanceScore: score, relevanceExplanation },
		})
}

/**
 * Whether a cheap model score is high enough to earn a premium model re-score.
 */
export function isPromoted(score: number): boolean {
	return score >= REVIEW_PROMOTION_THRESHOLD
}

/**
 * The fields that a fetch writes to the Resource row, plus the text it scores. A body written to object storage
 * is scored in memory and keeps its key. An empty scrape or a failed write scores the snippet instead and keeps no key.
 */
export function toFetchedContentFields(
	stored: { contentKey: string; bytes: number } | null,
	markdown: string,
	snippet: string | null,
): { scoringText: string; contentKey: string | null; contentBytes: number | null } {
	return {
		scoringText: stored ? markdown : (snippet ?? ""),
		contentKey: stored?.contentKey ?? null,
		contentBytes: stored?.bytes ?? null,
	}
}

// keep the model's score within the 0 to 1 range that the topic feed expects
function clampScore(score: number): number {
	return Math.max(0, Math.min(1, score))
}

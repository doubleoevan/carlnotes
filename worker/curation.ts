// curation turns a Scan's discovered Resources into topic findings.
// free dedupe and relevance stages run first, then paid fetch and scoring stages run under a per-Scan spend cap
import { cosineSimilarity, embed, generateText, type LanguageModel, Output } from "ai"
import { and, cosineDistance, eq, inArray, isNotNull, ne, notInArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db"
import { findings, resources, type scans } from "../db/schema"
import type { NewResource } from "./adapters/adapter"
import { buildTopicScanContext } from "./attachments"
import { cheapModel, embedModel, scoreModel } from "./models.ts"
import { fetchContent } from "./scrape.ts"

// stage thresholds for deduping and measuring relevance
const NEAR_DUPLICATE_DISTANCE = 0.05
const RELEVANCE_THRESHOLD = 0.35

// the cheap-tier model score that earns a premium model re-score and a why-summary. the environment can override it
const CURATION_PROMOTION_THRESHOLD = Number(Bun.env.CURATION_PROMOTION_THRESHOLD ?? "0.6")

// the per-Scan spend ceiling. only the paid fetch and scoring stages are gated by it
const CURATION_SCAN_BUDGET_USD = Number(Bun.env.CURATION_SCAN_BUDGET_USD ?? "0.5")

// text caps that bound tokens and spend
const MAX_EMBED_CHARS = 8000
const MAX_SCORE_CHARS = 8000

// the LiteLLM model name stamped onto a Resource's embedding_model column so that a later model change is just a backfill
const EMBED_MODEL_NAME = "embed-model"

// best-effort dollar rates for the soft cap and the per-stage breakdown. LiteLLM meters the authoritative spend
const EMBED_COST_PER_MILLION_TOKENS = 0.008
const CHEAP_COST_PER_MILLION_TOKENS = 0.2
const PREMIUM_COST_PER_MILLION_TOKENS = 0.6
const FIRECRAWL_COST_PER_FETCH = 0.001

// the model's structured output. a relevance score from 0 to 1, plus a why-summary only the premium model is asked to write
const scoreSchema = z.object({ score: z.number(), why: z.string().optional() })

// persisted Scan and Resource records, and the per-stage dollar breakdown recorded on the Scan
type Scan = typeof scans.$inferSelect
type Resource = typeof resources.$inferSelect
type StageCosts = { embedding: number; fetch: number; scoringCheap: number; scoringPremium: number }

// the running spend state threaded through the stages. it holds the total, its cap, and the per-stage breakdown
type Budget = { spent: number; cap: number; stageCosts: StageCosts }

// a scoring tier holds its model, its cost bucket and rate, and whether it writes a why-summary
type ScoreTier = { model: LanguageModel; stage: keyof StageCosts; ratePerMillion: number; shouldWriteWhy: boolean }

// the outcome of one Resource's pipeline. whether it is kept, filtered out, deferred by the spend cap, or failed
type ResourceOutcome =
	| { status: "kept"; why: string }
	| { status: "filtered" }
	| { status: "deferred" }
	| { status: "failed" }

// the scan curation summary with resource counts, costs and scan summary
type CurationSummary = {
	keptCount: number
	filteredCount: number
	cost: number
	stageCosts: Record<string, number>
	scanSummary: string
}

// curate a Scan's discovered Resources into Findings, returning the counts, cost, and recap the Scan records
export async function curateScan(scan: Scan, discoveredResources: NewResource[]): Promise<CurationSummary> {
	// load the unscored list of discovered Resources for this Topic
	const unscoredResources = await loadUnscoredResources(scan.topicId, discoveredResources)
	if (unscoredResources.length === 0) {
		return emptySummary()
	}

	// running tallies. the spend budget with its per-stage breakdown, the in-scan hash set, and the outcome counts
	const budget: Budget = { spent: 0, cap: CURATION_SCAN_BUDGET_USD, stageCosts: emptyStageCosts() }
	const seenHashes = new Set<string>()
	const whySummaries: string[] = []
	let keptCount = 0
	let filteredCount = 0

	// embed the topic's effective context once for the relevance gate, keeping its text for the scorer
	const topicContext = await loadTopicContext(scan.topicId, budget)

	// curate each Resource. curateResource never throws, so one bad Resource only degrades itself
	for (const resource of unscoredResources) {
		const resourceOutcome = await curateResource(resource, scan, topicContext, seenHashes, budget)
		// tally the outcome. a kept Resource contributes its why-summary to the recap
		if (resourceOutcome.status === "kept") {
			keptCount++
			whySummaries.push(resourceOutcome.why)
		} else if (resourceOutcome.status === "filtered") {
			filteredCount++
		}
	}

	// return a recap of the topic scan pipeline
	const scanSummary = await summarizeScan(keptCount, filteredCount, whySummaries, budget)
	return { keptCount, filteredCount, cost: budget.spent, stageCosts: budget.stageCosts, scanSummary }
}

// the stored Resource rows that this Scan discovered that have no topic finding yet
// excluding scored rows keeps re-scans from re-scoring them
async function loadUnscoredResources(topicId: string, discoveredResources: NewResource[]): Promise<Resource[]> {
	// the urls this scan discovered (already deduped by ingestion)
	const urls = discoveredResources.map((resource) => resource.url)
	if (urls.length === 0) {
		return []
	}

	// exclude Resources already scored for this Topic, then load the rest by url
	const scoredResourceIds = db.select({ id: findings.resourceId }).from(findings).where(eq(findings.topicId, topicId))
	return db
		.select()
		.from(resources)
		.where(and(inArray(resources.url, urls), notInArray(resources.id, scoredResourceIds)))
}

// embed the topic's context for the relevance gate
// that is the topic prompt plus its attachments' contexts, with the topic name as a fallback
async function loadTopicContext(topicId: string, budget: Budget): Promise<{ text: string; embedding: number[] }> {
	// the context text, falling back to the topic name so that the relevance scoring always has a seed
	const { name, context } = await buildTopicScanContext(topicId)
	const text = (context.trim() || name).slice(0, MAX_EMBED_CHARS)

	// embed the context once and tally the embedding cost
	const { embedding, usage } = await embed({ model: embedModel(), value: text })
	charge(budget, "embedding", tokenCost(usage.tokens, EMBED_COST_PER_MILLION_TOKENS))
	return { text, embedding }
}

// run a Resource through the pipeline, isolating any failure so it only degrades itself
async function curateResource(
	resource: Resource,
	scan: Scan,
	topicContext: { text: string; embedding: number[] },
	seenHashes: Set<string>,
	budget: Budget,
): Promise<ResourceOutcome> {
	// use the models to score the resource in stages
	try {
		return await runResourcePipeline(resource, scan, topicContext, seenHashes, budget)
	} catch (error) {
		console.error(`curation failed for resource ${resource.id}`, error)
		return { status: "failed" }
	}
}

// the six stages in order:
// 1. dedupe content hash
// 2. embed
// 3. dedupe embedding
// 4. check relevance
// 5. fetch the full content
// 6. score the resource
async function runResourcePipeline(
	resource: Resource,
	scan: Scan,
	topicContext: { text: string; embedding: number[] },
	seenHashes: Set<string>,
	budget: Budget,
): Promise<ResourceOutcome> {
	// stage 1 — content-hash dedupe over the native text, only when the Resource has some. empty rows must not collapse to one hash
	if (hasNativeText(resource)) {
		const hash = contentHash(resource.title, resource.snippet)
		// filter out a duplicate content hash
		if (seenHashes.has(hash) || (await hasStoredHash(hash, resource.id))) {
			return { status: "filtered" }
		}

		// persist the content hash so that later scans can dedupe against it
		seenHashes.add(hash)
		await db.update(resources).set({ contentHash: hash }).where(eq(resources.id, resource.id))
	}

	// stage 2 — embed the native text, reusing a Resource's existing global embedding
	const embedding = resource.embedding ?? (await embedResource(resource, budget))

	// stage 3 — drop a near-duplicate of an already-stored Resource
	if (await hasNearDuplicate(embedding, resource.id)) {
		return { status: "filtered" }
	}

	// stage 4 — check the relevance gate against the topic context
	if (!isRelevant(cosineSimilarity(embedding, topicContext.embedding))) {
		return { status: "filtered" }
	}

	// stages 5 and 6 are paid. defer the Resource once the Scan hits its spend ceiling
	if (!canSpend(budget)) {
		return { status: "deferred" }
	}

	// fetch the full content with a snippet fallback on failure,
	// score it against the topic context with tiered models,
	// then write the topic finding
	const resourceContent = await fetchResourceContent(resource, budget)
	const scoredResource = await scoreResource(resourceContent, topicContext.text, budget)
	await upsertFinding(scan, resource, scoredResource.score, scoredResource.why)
	return { status: "kept", why: scoredResource.why }
}

// any other Resource already carrying this content hash makes this a content-level duplicate
async function hasStoredHash(hash: string, excludeId: string): Promise<boolean> {
	// look for a stored Resource with the same hash
	const [duplicate] = await db
		.select({ id: resources.id })
		.from(resources)
		.where(and(eq(resources.contentHash, hash), ne(resources.id, excludeId)))
		.limit(1)
	return duplicate !== undefined
}

// embed a Resource's native text through with a model, storing the vector and the model that produced it
async function embedResource(resource: Resource, budget: Budget): Promise<number[]> {
	// embed the title and snippet, falling back to the url when both are empty, then track the cost
	const { embedding, usage } = await embed({ model: embedModel(), value: embedText(resource) })
	charge(budget, "embedding", tokenCost(usage.tokens, EMBED_COST_PER_MILLION_TOKENS))
	// stamp the model so a later embedding-model change is a backfill, not a schema change
	await db.update(resources).set({ embedding, embeddingModel: EMBED_MODEL_NAME }).where(eq(resources.id, resource.id))
	return embedding
}

// find the nearest stored Resource by cosine distance and decide whether it is a near-duplicate
async function hasNearDuplicate(embedding: number[], excludeId: string): Promise<boolean> {
	// the nearest other embedded Resource by cosine distance
	const distanceExpression = cosineDistance(resources.embedding, embedding)
	const [nearest] = await db
		.select({ distance: distanceExpression })
		.from(resources)
		.where(and(ne(resources.id, excludeId), isNotNull(resources.embedding)))
		.orderBy(distanceExpression)
		.limit(1)
	// no stored neighbor means nothing to duplicate
	if (!nearest) {
		return false
	}
	return isNearDuplicate(Number(nearest.distance))
}

// fetch the Resource's full content into the content column. on failure fall back to the native snippet, never the bare title
async function fetchResourceContent(resource: Resource, budget: Budget): Promise<string> {
	// fetch, store, and track the fetch cost. a failure degrades to the snippet without charging
	try {
		const content = await fetchContent(resource.url)
		await db.update(resources).set({ content }).where(eq(resources.id, resource.id))
		charge(budget, "fetch", FIRECRAWL_COST_PER_FETCH)
		// a scrape can succeed with no main content. that is no better than the snippet, so score the snippet instead
		return content || (resource.snippet ?? "")
	} catch (error) {
		// fetch failed — score against the native snippet, never the bare title
		console.error(`firecrawl fetch failed for ${resource.url}`, error)
		return resource.snippet ?? ""
	}
}

// score the substrate cheap-first, promoting only the best to the premium tier for the authoritative score and why-summary
async function scoreResource(
	resourceContent: string,
	topicContext: string,
	budget: Budget,
): Promise<{ score: number; why: string }> {
	// the cheap model scores everything fetched first
	const cheapTier: ScoreTier = {
		model: cheapModel(),
		stage: "scoringCheap",
		ratePerMillion: CHEAP_COST_PER_MILLION_TOKENS,
		shouldWriteWhy: false,
	}
	const cheapOutcome = await scoreResourceContent(cheapTier, resourceContent, topicContext, budget)

	// only Resources with a high enough cheap model score earn a premium model re-score
	// and only while the Scan is still under its spend cap
	if (!isPromoted(cheapOutcome.score) || !canSpend(budget)) {
		return cheapOutcome
	}

	// the premium model writes the final score and adds a why-summary
	const premiumTier: ScoreTier = {
		model: scoreModel(),
		stage: "scoringPremium",
		ratePerMillion: PREMIUM_COST_PER_MILLION_TOKENS,
		shouldWriteWhy: true,
	}
	return scoreResourceContent(premiumTier, resourceContent, topicContext, budget)
}

// a scoring call through LiteLLM structured output, adding its estimated cost to the budget
async function scoreResourceContent(
	scoreTier: ScoreTier,
	resourceContent: string,
	topicContext: string,
	budget: Budget,
): Promise<{ score: number; why: string }> {
	// structured output forces a numeric score. the why-summary is only asked for on the premium tier
	const { output, usage } = await generateText({
		model: scoreTier.model,
		output: Output.object({ schema: scoreSchema }),
		prompt: buildScorePrompt(resourceContent, topicContext, scoreTier.shouldWriteWhy),
	})

	// track the estimated cost, then return the clamped score and the why-summary
	// the cheap model leaves the why-summary empty
	charge(budget, scoreTier.stage, tokenCost(usage.totalTokens ?? 0, scoreTier.ratePerMillion))
	return { score: clampScore(output.score), why: output.why ?? "" }
}

// upsert one finding per topic and resource. re-scoring updates the existing row instead of adding another
async function upsertFinding(scan: Scan, resource: Resource, score: number, why: string): Promise<void> {
	// insert the topic finding, or update it in place on the topic and resource unique constraint
	await db
		.insert(findings)
		.values({
			topicId: scan.topicId,
			resourceId: resource.id,
			scanId: scan.id,
			relevanceScore: score,
			relevanceExplanation: why,
		})
		.onConflictDoUpdate({
			target: [findings.topicId, findings.resourceId],
			set: { scanId: scan.id, relevanceScore: score, relevanceExplanation: why },
		})
}

// recap what the Scan did for the topic pipeline
async function summarizeScan(
	keptCount: number,
	filteredCount: number,
	whySummaries: string[],
	budget: Budget,
): Promise<string> {
	// the output is summary text and model usage tokens
	const { text, usage } = await generateText({
		model: cheapModel(),
		prompt: buildSummaryPrompt(keptCount, filteredCount, whySummaries),
	})

	// track the recap cost under the cheap-scoring bucket so that no token spend goes unaccounted
	charge(budget, "scoringCheap", tokenCost(usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))
	return text.trim()
}

// whether a Resource carries any adapter-native text to hash and embed like a title or a snippet
function hasNativeText(resource: Resource): boolean {
	return Boolean(resource.title?.trim() || resource.snippet?.trim())
}

// the native text curation embeds the capped title and snippet, falling back to the url when both are empty
function embedText(resource: Resource): string {
	// join title and snippet, then cap the text to bound token limits
	const text = `${resource.title ?? ""}\n${resource.snippet ?? ""}`.trim()
	return (text || resource.url).slice(0, MAX_EMBED_CHARS)
}

// stable sha256 over the normalized native text so content-level duplicates hash alike across sources
export function contentHash(title: string | null, snippet: string | null): string {
	// normalize then hash. empty parts are fine, this only needs to be deterministic
	const text = normalizeText(`${title ?? ""}\n${snippet ?? ""}`)
	return new Bun.CryptoHasher("sha256").update(text).digest("hex")
}

// lowercase and collapse whitespace so that trivial formatting differences don't defeat the hash
export function normalizeText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim()
}

// build the scoring prompt. a why-summary is only requested from the premium tier model
export function buildScorePrompt(resourceContent: string, topicContext: string, shouldWriteWhy: boolean): string {
	// cap the content to bound tokens and spend
	const content = resourceContent.slice(0, MAX_SCORE_CHARS)
	const whyLine = shouldWriteWhy ? " Also give a one-sentence why-summary explaining the relevance." : ""
	return `Score how relevant the content below is to the reader's topic context, from 0 (irrelevant) to 1 (highly relevant).${whyLine}\n\nTopic context:\n${topicContext}\n\nContent:\n${content}`
}

// build the recap summary prompt over the scan's tallies and the top resource why-summaries
export function buildSummaryPrompt(
	keptResourceCount: number,
	filteredResourceCount: number,
	whySummaries: string[],
): string {
	// the top few non-empty reasons a Resource was kept
	const topReasons = whySummaries.filter(Boolean).slice(0, 5)
	return `Write a brief recap of a content scan that kept ${keptResourceCount} and filtered ${filteredResourceCount} resources. Top reasons kept:\n${topReasons.join("\n")} and new information discovered.`
}

// add a stage's estimated dollars to both its bucket and the running total
export function charge(budget: Budget, stage: keyof StageCosts, dollars: number): void {
	budget.stageCosts[stage] += dollars
	budget.spent += dollars
}

// best-effort dollar estimate from token usage. LiteLLM tracks the authoritative spend
export function tokenCost(tokens: number, ratePerMillion: number): number {
	return (tokens / 1_000_000) * ratePerMillion
}

// a cosine distance below the threshold marks a near-duplicate resource
export function isNearDuplicate(distance: number): boolean {
	return distance < NEAR_DUPLICATE_DISTANCE
}

// a similarity at or above the threshold passes the resource relevance gate
export function isRelevant(similarity: number): boolean {
	return similarity >= RELEVANCE_THRESHOLD
}

// a cheap model score at or above the threshold earns a premium model re-score
export function isPromoted(score: number): boolean {
	return score >= CURATION_PROMOTION_THRESHOLD
}

// paid tasks may run only while the Scan is under its spend ceiling
export function canSpend(budget: Budget): boolean {
	return budget.spent < budget.cap
}

// keep the model's score within the 0 to 1 range that the topic feed expects
function clampScore(score: number): number {
	return Math.max(0, Math.min(1, score))
}

// a new zeroed per-stage breakdown to hydrate
function emptyStageCosts(): StageCosts {
	return { embedding: 0, fetch: 0, scoringCheap: 0, scoringPremium: 0 }
}

// the empty summary for a Scan with nothing to curate. no findings, no cost, an empty breakdown
function emptySummary(): CurationSummary {
	return { keptCount: 0, filteredCount: 0, cost: 0, stageCosts: {}, scanSummary: "" }
}

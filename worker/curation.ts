// curation: turn a Scan's discovered Resources into topic-scoped Findings — hash + embedding dedupe, an embed-filter gate, then Firecrawl fetch and tiered LLM scoring for survivors, all under a per-Scan spend cap
import { cosineSimilarity, embed, generateText, type LanguageModel, Output } from "ai"
import { and, cosineDistance, eq, inArray, isNotNull, ne, notInArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db"
import { findings, resources, type scans } from "../db/schema"
import type { NewResource } from "./adapters/adapter"
import { topicScanContext } from "./attachments"
import { fetchContent } from "./firecrawl"
import { cheapModel, embedModel, scoreModel } from "./llm"

// stage thresholds, tuned once real scans are observed (top-of-file per adapter-authoring)
const NEAR_DUPLICATE_DISTANCE = 0.05
const RELEVANCE_THRESHOLD = 0.35
// the cheap-tier score at or above which a Resource earns a premium re-score and a why-summary (env-overridable)
const CURATION_PROMOTION_THRESHOLD = Number(Bun.env.CURATION_PROMOTION_THRESHOLD ?? "0.6")
// the per-Scan spend ceiling; only the paid stages (fetch, scoring) are gated by it
const CURATION_SCAN_BUDGET_USD = Number(Bun.env.CURATION_SCAN_BUDGET_USD ?? "0.5")
// text caps bound tokens/spend, mirroring the search adapter's context cap
const MAX_EMBED_CHARS = 8000
const MAX_SCORE_CHARS = 8000
// the litellm model_name stamped onto a Resource's embedding_model, so a model change is a backfill
const EMBED_MODEL_NAME = "embed-model"
// best-effort dollar rates for the soft cap and the per-stage breakdown; LiteLLM meters authoritative spend
// ponytail: token×rate estimates; swap to LiteLLM's /spend read-back only if they drift enough to mis-fire the cap
const EMBED_COST_PER_MILLION_TOKENS = 0.008
const CHEAP_COST_PER_MILLION_TOKENS = 0.2
const PREMIUM_COST_PER_MILLION_TOKENS = 0.6
const FIRECRAWL_COST_PER_FETCH = 0.001

// the model's structured score: a 0..1 relevance score, plus a why-summary only the premium tier is asked to write
const scoreSchema = z.object({ score: z.number(), why: z.string().optional() })

// a persisted Scan/Resource row, and the per-stage dollar breakdown recorded on the Scan
type Scan = typeof scans.$inferSelect
type Resource = typeof resources.$inferSelect
type StageCosts = { embedding: number; fetch: number; scoringCheap: number; scoringPremium: number }
// the running spend state threaded through the stages: the total, its cap, and its per-stage breakdown
type Budget = { spent: number; cap: number; stageCosts: StageCosts }
// a scoring tier: its model, its cost bucket and rate, and whether it writes a why-summary
type ScoreTier = { model: LanguageModel; stage: keyof StageCosts; ratePerMillion: number; shouldWriteWhy: boolean }
// what one Resource's pipeline produced: a scored Finding, a dedupe/relevance drop, a spend-cap skip, or an isolated error
type ResourceOutcome =
	| { status: "kept"; why: string }
	| { status: "filtered" }
	| { status: "deferred" }
	| { status: "failed" }
// the outputs the Scan close records: the curation counts, its cost, the per-stage breakdown, and the recap
type CurationSummary = {
	keptCount: number
	filteredCount: number
	cost: number
	stageCosts: Record<string, number>
	aiSummary: string
}

// curate a Scan's discovered Resources into Findings, returning the counts, cost, and recap the Scan close records
export async function curateScan(scan: Scan, found: NewResource[]): Promise<CurationSummary> {
	// load the work-list: discovered Resources not yet scored for this Topic
	const workList = await loadUnscored(scan.topicId, found)
	if (workList.length === 0) {
		return emptySummary()
	}
	// running tallies: the spend budget with its per-stage breakdown, the in-scan hash set, and the outcome counts
	const budget: Budget = { spent: 0, cap: CURATION_SCAN_BUDGET_USD, stageCosts: emptyStageCosts() }
	const seenHashes = new Set<string>()
	const whySummaries: string[] = []
	let keptCount = 0
	let filteredCount = 0

	// embed the topic's effective context once for the relevance gate, keeping its text for the scorer
	const context = await loadContext(scan.topicId, budget)

	// walk each Resource through the stages; curateResource never throws, so one bad Resource degrades only itself
	for (const resource of workList) {
		const outcome = await curateResource(resource, scan, context, seenHashes, budget)
		// tally the outcome; a kept Resource contributes its why-summary to the recap
		if (outcome.status === "kept") {
			keptCount += 1
			whySummaries.push(outcome.why)
		} else if (outcome.status === "filtered") {
			filteredCount += 1
		}
	}

	// recap the scan for the topic history (metered onto the budget), then return the outputs the Scan close records
	const aiSummary = await summarizeScan(keptCount, filteredCount, whySummaries, budget)
	return { keptCount, filteredCount, cost: budget.spent, stageCosts: budget.stageCosts, aiSummary }
}

// the stored Resource rows this Scan discovered that have no Finding yet for this Topic (an anti-join keeps re-scans from re-scoring)
async function loadUnscored(topicId: string, found: NewResource[]): Promise<Resource[]> {
	// the urls this scan discovered (already deduped by ingestion)
	const urls = found.map((resource) => resource.url)
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

// embed the topic's effective context (its own context + attachments, name fallback when empty) for the relevance gate
async function loadContext(topicId: string, budget: Budget): Promise<{ text: string; embedding: number[] }> {
	// the effective context text, falling back to the topic name so the gate always has a seed
	const { name, context } = await topicScanContext(topicId)
	const text = (context.trim() || name).slice(0, MAX_EMBED_CHARS)
	// embed it once and meter the embedding cost
	const { embedding, usage } = await embed({ model: embedModel(), value: text })
	charge(budget, "embedding", tokenCost(usage.tokens, EMBED_COST_PER_MILLION_TOKENS))
	return { text, embedding }
}

// run one Resource through the pipeline, isolating any failure so it degrades only this Resource (mirrors ingestSource)
async function curateResource(
	resource: Resource,
	scan: Scan,
	context: { text: string; embedding: number[] },
	seenHashes: Set<string>,
	budget: Budget,
): Promise<ResourceOutcome> {
	// a thrown stage (one bad fetch/score) skips only this Resource; the batch continues
	try {
		return await runStages(resource, scan, context, seenHashes, budget)
	} catch (error) {
		console.error(`curation failed for resource ${resource.id}`, error)
		return { status: "failed" }
	}
}

// the six stages: hash dedupe → embed → embedding dedupe → embed-filter (free), then fetch → score (paid, cap-gated)
async function runStages(
	resource: Resource,
	scan: Scan,
	context: { text: string; embedding: number[] },
	seenHashes: Set<string>,
	budget: Budget,
): Promise<ResourceOutcome> {
	// stage 1 — content-hash dedupe over the native text, only when the Resource has some (empty rows must not collapse to one hash)
	if (hasNativeText(resource)) {
		const hash = contentHash(resource.title, resource.snippet)
		// a hash seen this scan or already stored on another Resource is a content-level duplicate
		if (seenHashes.has(hash) || (await hashStored(hash, resource.id))) {
			return { status: "filtered" }
		}
		// first occurrence: record and persist it so later scans dedupe against it
		seenHashes.add(hash)
		await db.update(resources).set({ contentHash: hash }).where(eq(resources.id, resource.id))
	}

	// stage 2 — embed the native text, reusing a Resource's existing global embedding
	const embedding = resource.embedding ?? (await embedResource(resource, budget))

	// stage 3 — drop a near-duplicate of an already-stored Resource
	if (await hasNearDuplicate(embedding, resource.id)) {
		return { status: "filtered" }
	}

	// stage 4 — the free relevance gate against the topic context
	if (!isRelevant(cosineSimilarity(embedding, context.embedding))) {
		return { status: "filtered" }
	}

	// stages 5+6 are paid — defer the whole Resource once the Scan hits its spend ceiling
	if (!canSpend(budget)) {
		return { status: "deferred" }
	}
	// fetch full content (snippet fallback on failure), score it tiered, and write the Finding
	const substrate = await fetchOrSnippet(resource, budget)
	const scored = await scoreTiered(substrate, context.text, budget)
	await upsertFinding(scan, resource, scored.score, scored.why)
	return { status: "kept", why: scored.why }
}

// any other Resource already carrying this content hash makes this one a content-level duplicate
async function hashStored(hash: string, excludeId: string): Promise<boolean> {
	// look for one other Resource with the same hash
	const [duplicate] = await db
		.select({ id: resources.id })
		.from(resources)
		.where(and(eq(resources.contentHash, hash), ne(resources.id, excludeId)))
		.limit(1)
	return duplicate !== undefined
}

// embed a Resource's native text through LiteLLM, storing the vector and the model that produced it
async function embedResource(resource: Resource, budget: Budget): Promise<number[]> {
	// embed the title + snippet (url fallback when both are empty), then meter the cost
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

// fetch the Resource's full content into `content`, falling back to the native snippet (never the title) on failure
async function fetchOrSnippet(resource: Resource, budget: Budget): Promise<string> {
	// fetch, store, and meter the fetch cost; a failure degrades to the snippet without charging
	try {
		const content = await fetchContent(resource.url)
		await db.update(resources).set({ content }).where(eq(resources.id, resource.id))
		charge(budget, "fetch", FIRECRAWL_COST_PER_FETCH)
		// an empty scrape (200 with no main content) is no better than the snippet — score the snippet instead
		return content || (resource.snippet ?? "")
	} catch (error) {
		// fetch failed — score against the native snippet, never the bare title
		console.error(`firecrawl fetch failed for ${resource.url}`, error)
		return resource.snippet ?? ""
	}
}

// score the substrate cheap-first, promoting only the best to the premium tier for the authoritative score + why-summary
async function scoreTiered(
	substrate: string,
	context: string,
	budget: Budget,
): Promise<{ score: number; why: string }> {
	// first pass: the cheap tier scores everything fetched
	const cheapTier: ScoreTier = {
		model: cheapModel(),
		stage: "scoringCheap",
		ratePerMillion: CHEAP_COST_PER_MILLION_TOKENS,
		shouldWriteWhy: false,
	}
	const cheap = await scoreOnce(cheapTier, substrate, context, budget)
	// only promoted Resources earn a premium re-score — and only while the Scan is still under its spend cap
	if (!isPromoted(cheap.score) || !canSpend(budget)) {
		return cheap
	}
	// the premium tier writes the authoritative score and the why-summary
	const premiumTier: ScoreTier = {
		model: scoreModel(),
		stage: "scoringPremium",
		ratePerMillion: PREMIUM_COST_PER_MILLION_TOKENS,
		shouldWriteWhy: true,
	}
	return scoreOnce(premiumTier, substrate, context, budget)
}

// one scoring call through LiteLLM structured output, metering its estimated cost onto the budget
async function scoreOnce(
	tier: ScoreTier,
	substrate: string,
	context: string,
	budget: Budget,
): Promise<{ score: number; why: string }> {
	// structured output forces a numeric score (and a why only when the premium tier is asked)
	const { output, usage } = await generateText({
		model: tier.model,
		output: Output.object({ schema: scoreSchema }),
		prompt: buildScorePrompt(substrate, context, tier.shouldWriteWhy),
	})
	// meter the estimated cost, then return the clamped score and the why (empty for the cheap tier)
	charge(budget, tier.stage, tokenCost(usage.totalTokens ?? 0, tier.ratePerMillion))
	return { score: clampScore(output.score), why: output.why ?? "" }
}

// upsert one Finding per (topic, resource): re-scoring updates the existing row instead of duplicating
async function upsertFinding(scan: Scan, resource: Resource, score: number, why: string): Promise<void> {
	// insert the Finding, or update it in place on the (topic_id, resource_id) unique constraint
	await db
		.insert(findings)
		.values({ topicId: scan.topicId, resourceId: resource.id, scanId: scan.id, signalScore: score, whySummary: why })
		.onConflictDoUpdate({
			target: [findings.topicId, findings.resourceId],
			set: { scanId: scan.id, signalScore: score, whySummary: why },
		})
}

// one cheap-tier recap of what the Scan did, for the topic history (the schema wants ai_summary llm-written); metered like any call
async function summarizeScan(
	keptCount: number,
	filteredCount: number,
	whySummaries: string[],
	budget: Budget,
): Promise<string> {
	// no schema — the output is just prose
	const { text, usage } = await generateText({
		model: cheapModel(),
		prompt: buildSummaryPrompt(keptCount, filteredCount, whySummaries),
	})
	// meter the recap under the cheap-scoring bucket so no LLM spend goes unaccounted
	charge(budget, "scoringCheap", tokenCost(usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))
	return text.trim()
}

// whether a Resource carries any adapter-native text to hash and embed (title or snippet)
function hasNativeText(resource: Resource): boolean {
	return Boolean(resource.title?.trim() || resource.snippet?.trim())
}

// the native text curation embeds: title and snippet, capped; falls back to the url when both are empty
function embedText(resource: Resource): string {
	// join title and snippet, then cap to bound tokens
	const text = `${resource.title ?? ""}\n${resource.snippet ?? ""}`.trim()
	return (text || resource.url).slice(0, MAX_EMBED_CHARS)
}

// stable sha256 over the normalized native text so content-level duplicates hash alike across sources
export function contentHash(title: string | null, snippet: string | null): string {
	// normalize then hash; empty parts are fine, this only needs to be deterministic
	const text = normalizeText(`${title ?? ""}\n${snippet ?? ""}`)
	return new Bun.CryptoHasher("sha256").update(text).digest("hex")
}

// lowercase and collapse whitespace so trivial formatting differences don't defeat the hash
export function normalizeText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim()
}

// build the scoring prompt; a why-summary is requested only for the premium tier
export function buildScorePrompt(substrate: string, context: string, shouldWriteWhy: boolean): string {
	// cap the content to bound tokens/spend, mirroring the search adapter's context cap
	const capped = substrate.slice(0, MAX_SCORE_CHARS)
	const whyLine = shouldWriteWhy ? " Also give a one-sentence why-summary explaining the relevance." : ""
	return `Score how relevant the content below is to the reader's topic context, from 0 (irrelevant) to 1 (highly relevant).${whyLine}\n\nTopic context:\n${context}\n\nContent:\n${capped}`
}

// build the recap prompt over the scan's tallies and the top why-summaries
export function buildSummaryPrompt(keptCount: number, filteredCount: number, whySummaries: string[]): string {
	// the top few non-empty reasons a Resource was kept
	const topReasons = whySummaries.filter(Boolean).slice(0, 5)
	return `Write a one-sentence recap of a content scan that kept ${keptCount} and filtered ${filteredCount} resources. Top reasons kept:\n${topReasons.join("\n")}`
}

// add a stage's estimated dollars to both its bucket and the running total
export function charge(budget: Budget, stage: keyof StageCosts, dollars: number): void {
	budget.stageCosts[stage] += dollars
	budget.spent += dollars
}

// best-effort dollar estimate from token usage; LiteLLM meters authoritative spend
export function tokenCost(tokens: number, ratePerMillion: number): number {
	return (tokens / 1_000_000) * ratePerMillion
}

// a cosine distance below the threshold marks a near-duplicate
export function isNearDuplicate(distance: number): boolean {
	return distance < NEAR_DUPLICATE_DISTANCE
}

// a similarity at or above the threshold passes the relevance gate
export function isRelevant(similarity: number): boolean {
	return similarity >= RELEVANCE_THRESHOLD
}

// a cheap score at or above the threshold earns a premium re-score
export function isPromoted(score: number): boolean {
	return score >= CURATION_PROMOTION_THRESHOLD
}

// paid work may run only while the Scan is under its spend ceiling
export function canSpend(budget: Budget): boolean {
	return budget.spent < budget.cap
}

// keep the model's score within the 0..1 signal range the Feed expects
function clampScore(score: number): number {
	return Math.max(0, Math.min(1, score))
}

// a fresh zeroed per-stage breakdown
function emptyStageCosts(): StageCosts {
	return { embedding: 0, fetch: 0, scoringCheap: 0, scoringPremium: 0 }
}

// the summary for a Scan with nothing to curate: no findings, no cost, an empty breakdown
function emptySummary(): CurationSummary {
	return { keptCount: 0, filteredCount: 0, cost: 0, stageCosts: {}, aiSummary: "" }
}

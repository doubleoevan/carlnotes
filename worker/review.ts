// review turns a Scan's discovered Resources into topic findings.
// free dedupe and relevance stages run first, then paid fetch and scoring stages run under a per-Scan spend cap
import { cosineSimilarity, generateText, type LanguageModel, Output } from "ai"
import { and, cosineDistance, eq, inArray, isNotNull, ne, notInArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db"
import { EMBED_DIMENSIONS, findings, resources, type scans } from "../db/schema"
import type { NewResource } from "./adapters/adapter"
import { buildTopicScanContext } from "./attach"
import { cheapModel, embedVector, scoreModel } from "./models.ts"
// the prompt loader fetches the registry version first, falling back to the bundled markdown
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "./prompts/fetch.ts"
import { filterPremiumPrompt, writePrompt } from "./prompts/write.ts"
import { fetchContent, revalidateContent } from "./scrape.ts"
import { deleteResourceContent, getResourceContent, toResourceContentKey, uploadResourceContent } from "./store"

// stage thresholds for deduping and measuring relevance
const NEAR_DUPLICATE_DISTANCE = 0.05
const RELEVANCE_THRESHOLD = 0.35

// the cheap model score that earns a premium model re-score and a relevance explanation. the environment can override it
const REVIEW_PROMOTION_THRESHOLD = Number(Bun.env.REVIEW_PROMOTION_THRESHOLD ?? "0.6")

// the per-Scan spend ceiling. only the paid fetch and scoring stages are gated by it
const REVIEW_SCAN_BUDGET_USD = Number(Bun.env.REVIEW_SCAN_BUDGET_USD ?? "0.5")

// stored resource content stays reusable for this long before a scan revalidates or refetches it. the environment can override it
const CONTENT_TTL_MS = Number(Bun.env.CONTENT_TTL_MS ?? String(24 * 60 * 60 * 1000))

// the hard cap on how many resources one Scan scores, bounding the paid fetch-and-scoring section. the environment can override it
const MAX_SCORED_RESOURCES_PER_SCAN = Number(Bun.env.MAX_SCORED_RESOURCES_PER_SCAN ?? "30")

// text caps that bound tokens and spend
const MAX_EMBED_CHARS = 8000
const MAX_SCORE_CHARS = 8000

// the most kept findings the scan report prompt lists in full. the overflow is named in the block, never silently cut
const MAX_TOPIC_SCAN_REPORT_FINDINGS = 20

// the curation embedding's vector space, stamped onto embedding_model so a row names its model and dimension, not the
// routing alias, making a later change a detectable backfill. EMBED_DIMENSIONS keeps the stamp and the schema in step
const EMBED_MODEL_NAME = `qwen3-embedding-8b/${EMBED_DIMENSIONS}`

// qwen3 is instruction-aware, so the query side is wrapped with this task instruction while documents stay plain.
// omitting the query instruction costs a few percent of retrieval quality
const EMBED_QUERY_INSTRUCTION = "Given a topic's interest description, retrieve web resources relevant to it"

// best-effort dollar rates for the soft cap and the per-stage breakdown. LiteLLM meters the authoritative spend
const EMBED_COST_PER_MILLION_TOKENS = 0.1
const CHEAP_COST_PER_MILLION_TOKENS = 0.2
const PREMIUM_COST_PER_MILLION_TOKENS = 0.6
const FIRECRAWL_COST_PER_FETCH = 0.001

// the model's structured output. a relevance score from 0 to 1, plus a relevance explanation that only the premium model is asked to write
const scoreSchema = z.object({ score: z.number(), relevanceExplanation: z.string().optional() })

// persisted Scan and Resource records, and the per-stage dollar breakdown recorded on the Scan
type Scan = typeof scans.$inferSelect
type Resource = typeof resources.$inferSelect
type StageCosts = { embedding: number; fetch: number; scoringCheap: number; scoringPremium: number }

// the fetch outcome for one Resource: content reused within the ttl, revalidated by a 304, or freshly fetched
type FetchOutcome = "reused" | "revalidated" | "fetched"
type FetchOutcomeCounts = { reusedCount: number; revalidatedCount: number; fetchedCount: number }

// the running budget threaded through the paid stages: dollars spent and the dollar ceiling, the per-stage cost breakdown,
// the limit on how many resources may be scored, and the reused/revalidated/fetched counts
type Budget = {
	spent: number
	cap: number
	stageCosts: StageCosts
	maxScoredResources: number
	fetchCounts: FetchOutcomeCounts
}

// a scoring tier holds its model, its cost bucket and rate, and whether it writes the relevance explanation
type ScoreTier = {
	model: LanguageModel
	stage: keyof StageCosts
	ratePerMillion: number
	shouldWriteRelevanceExplanation: boolean
}

// the topic's derived context loaded once per Scan: its name, its embedded text, and the embedding the relevance gate compares against
type TopicContext = { name: string; text: string; embedding: number[] }

// one Source's ingestion outcome as the scan hands it over, read by the report's sources section
export type ScannedSource = { sourceKind: string; status: "ok" | "failed" | "skipped"; fallbackMode?: string }

// the reasons the free stages drop a Resource before any paid work
type FilterReason = "duplicate content" | "near-duplicate" | "below relevance threshold"

// a kept resource finding's details, collected for the scan report
type KeptFinding = { title: string | null; url: string; relevanceScore: number; relevanceExplanation: string }

// the outcome of one Resource's pipeline. whether it was kept, filtered out, deferred by the spend cap, or failed
type ResourceOutcome =
	| { status: "kept"; finding: KeptFinding }
	| { status: "filtered"; reason: FilterReason }
	| { status: "deferred" }
	| { status: "failed" }

// the review outcome the scan report reads: kept resource finding details, per-reason filter counts, and the deferred and failed counts
type ReviewOutcome = {
	keptFindings: KeptFinding[]
	filteredCounts: Record<FilterReason, number>
	deferredCount: number
	failedCount: number
}

// data the scan report prompt is rendered with
type ScanPromptData = {
	topicName: string
	topicContext: string
	date: string
	// the pipeline outcomes that the report blocks are composed from
	reviewOutcome: ReviewOutcome
	scannedSources: ScannedSource[]
	budget: Budget
}

// the scan review summary with resource counts, costs, fetch-outcome counts, and scan summary
type ReviewSummary = {
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

// reviews a Scan's discovered Resources, writes Findings and returns the counts, cost, outcome, and summary.
// litellmApiKey bills its LLM calls to the topic owner's virtual key, falling back to the master key when absent
export async function reviewScan(
	scan: Scan,
	discoveredResources: NewResource[],
	scannedSources: ScannedSource[],
	litellmApiKey?: string,
): Promise<ReviewSummary> {
	// load the unscored list of discovered Resources for this Topic
	const unscoredResources = await loadUnscoredResources(scan.topicId, discoveredResources)
	if (unscoredResources.length === 0) {
		return emptyReviewSummary()
	}

	// running state of the budget: the content hashes seen this scan, and the per-outcome review totals
	const budget: Budget = {
		spent: 0,
		cap: REVIEW_SCAN_BUDGET_USD,
		stageCosts: emptyStageCosts(),
		maxScoredResources: MAX_SCORED_RESOURCES_PER_SCAN,
		fetchCounts: emptyFetchCounts(),
	}
	const seenHashes = new Set<string>()
	const reviewOutcome = emptyReviewOutcome()

	// embed the topic's effective context once for the relevance gate, keeping its name and text for the scorer and the report
	const topicContext = await loadTopicContext(scan.topicId, budget, litellmApiKey)

	// review each Resource. reviewResource never throws, so one bad Resource only degrades itself
	for (const resource of unscoredResources) {
		const resourceOutcome = await reviewResource(resource, scan, topicContext, seenHashes, budget, litellmApiKey)
		trackOutcomes(reviewOutcome, resourceOutcome)
	}

	// summarize the scan over what actually happened
	const scanSummary = await summarizeScan(topicContext, reviewOutcome, scannedSources, budget, litellmApiKey)

	// fold the totals into the summary that the Scan records
	return {
		keptCount: reviewOutcome.keptFindings.length,
		filteredCount: countFilteredResources(reviewOutcome),
		// spend and the report round out what the Scan stores
		cost: budget.spent,
		stageCosts: budget.stageCosts,
		scanSummary,
		// the reused, revalidated, and fetched counts
		reusedCount: budget.fetchCounts.reusedCount,
		revalidatedCount: budget.fetchCounts.revalidatedCount,
		fetchedCount: budget.fetchCounts.fetchedCount,
	}
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
async function loadTopicContext(topicId: string, budget: Budget, litellmApiKey?: string): Promise<TopicContext> {
	// the context text, falling back to the topic name so that the relevance scoring always has a seed
	const { name, context } = await buildTopicScanContext(topicId)
	const text = (context.trim() || name).slice(0, MAX_EMBED_CHARS)

	// embed the context as the query side once and update the estimated embedding cost
	const embedding = await embedQuery(text, litellmApiKey)
	charge(budget, "embedding", tokenCost(estimateEmbedTokens(text), EMBED_COST_PER_MILLION_TOKENS))
	return { name, text, embedding }
}

// run a Resource through the pipeline, isolating any failure so it only degrades itself
async function reviewResource(
	resource: Resource,
	scan: Scan,
	topicContext: TopicContext,
	seenHashes: Set<string>,
	budget: Budget,
	litellmApiKey?: string,
): Promise<ResourceOutcome> {
	// use the models to score the resource in stages
	try {
		return await runResourcePipeline(resource, scan, topicContext, seenHashes, budget, litellmApiKey)
	} catch (error) {
		console.error(`review failed for resource ${resource.id}`, error)
		return { status: "failed" }
	}
}

// the seven stages in order:
// 1. dedupe content hash
// 2. embed
// 3. dedupe embedding
// 4. check relevance
// 5. fetch the full content
// 6. score the resource content against the topic context
// 7. write the finding record
async function runResourcePipeline(
	resource: Resource,
	scan: Scan,
	topicContext: TopicContext,
	seenContentHashes: Set<string>,
	budget: Budget,
	litellmApiKey?: string,
): Promise<ResourceOutcome> {
	// stage 1 — content-hash dedupe over the native text, only when the Resource has content. empty rows must not collapse to one hash
	if (hasNativeText(resource)) {
		const contentHash = toContentHash(resource.title, resource.snippet)
		// filter out a duplicate content hash
		if (seenContentHashes.has(contentHash) || (await hasStoredHash(contentHash, resource.id))) {
			return { status: "filtered", reason: "duplicate content" }
		}

		// persist the content hash so that later scans can dedupe against it
		seenContentHashes.add(contentHash)
		await db.update(resources).set({ contentHash }).where(eq(resources.id, resource.id))
	}

	// stage 2 — embed the native text, reusing a Resource's existing global embedding
	const embedding = resource.embedding ?? (await embedResource(resource, budget, litellmApiKey))

	// stage 3 — drop a near-duplicate of an already-stored Resource
	if (await hasNearDuplicate(embedding, resource.id)) {
		return { status: "filtered", reason: "near-duplicate" }
	}

	// stage 4 — check the relevance gate against the topic context
	if (!isRelevant(cosineSimilarity(embedding, topicContext.embedding))) {
		return { status: "filtered", reason: "below relevance threshold" }
	}

	// stages 5 and 6 are paid. defer the Resource once the Scan hits its dollar ceiling or its scored-resource limit
	if (!canPay(budget)) {
		return { status: "deferred" }
	}

	// get the content by reuse, revalidation, or a paid fetch, then increment the FetchOutcome, which advances the scored-resource count
	const { content, fetchOutcome } = await fetchResourceContent(resource, budget)
	budget.fetchCounts[toFetchCountKey(fetchOutcome)]++

	// score the content against the topic context with tiered models, then write the topic finding
	const scoredResource = await scoreResource(content, topicContext.text, budget, litellmApiKey)
	await upsertFinding(scan, resource, scoredResource.score, scoredResource.relevanceExplanation)

	// the kept outcome carries the feed-facing details that the report cites
	const keptFinding = {
		title: resource.title,
		url: resource.url,
		// the score and note come from the tiered scoring call
		relevanceScore: scoredResource.score,
		relevanceExplanation: scoredResource.relevanceExplanation,
	}
	return { status: "kept", finding: keptFinding }
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

// embed a Resource's native text with the embedding model, storing the vector and the model name that produced it
async function embedResource(resource: Resource, budget: Budget, litellmApiKey?: string): Promise<number[]> {
	// embed the title and snippet as a document, falling back to the url when both are empty, then track the estimated cost
	const documentText = embedText(resource)
	const embedding = await embedVector(documentText, litellmApiKey)
	charge(budget, "embedding", tokenCost(estimateEmbedTokens(documentText), EMBED_COST_PER_MILLION_TOKENS))
	// stamp the vector space so a later model or dimension change is a detectable backfill
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

// get the survivor's content: reuse it if fresh, revalidate stale content with a cheap conditional GET, else fetch from Firecrawl.
// reuse and a 304 cost no fetch credit. only the Firecrawl fetch is billed, and a failed fetch falls back to the snippet
async function fetchResourceContent(
	resource: Resource,
	budget: Budget,
): Promise<{ content: string; fetchOutcome: FetchOutcome }> {
	// reuse fresh stored content scores as-is, read back from object storage, with no fetch
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
		console.error(`object-storage read failed for resource ${resourceId}`, error)
		return null
	}
}

// fetch the content from Firecrawl, write it to object storage, and record its key, size, and validators on the row.
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

		// decide the text to score and the key to store, then record the validators and key on the row
		const { scoringText, contentKey, contentBytes } = toFetchedContentFields(stored, markdown, resource.snippet)
		await db
			.update(resources)
			.set({ contentKey, contentBytes, etag, lastModified, fetchedAt: new Date() })
			.where(eq(resources.id, resource.id))
		return { content: scoringText, fetchOutcome: "fetched" }
	} catch (error) {
		// fetch failed — score against the native snippet, never the bare title
		console.error(`firecrawl fetch failed for ${resource.url}`, error)
		return { content: resource.snippet ?? "", fetchOutcome: "fetched" }
	}
}

// write the fetched Markdown to object storage, returning its key and size, or null when the write fails.
// a failed write best-effort deletes the object so it leaves no orphan, and curation falls back to the snippet
async function storeResourceContent(
	resourceId: string,
	markdown: string,
): Promise<{ contentKey: string; bytes: number } | null> {
	try {
		return await uploadResourceContent(resourceId, markdown)
	} catch (error) {
		// the write failed. best-effort delete any partial object, then report null so scoring uses the snippet
		console.error(`object-storage write failed for resource ${resourceId}`, error)
		await deleteResourceContent(toResourceContentKey(resourceId)).catch(() => {})
		return null
	}
}

// score the resource content with the cheap model first, promoting only the best to the premium model for the final score and relevance explanation
async function scoreResource(
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
		// the reader-facing note comes only from this tier
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

// upsert one finding per topic and resource. re-scoring updates the existing row instead of adding another
async function upsertFinding(
	scan: Scan,
	resource: Resource,
	score: number,
	relevanceExplanation: string,
): Promise<void> {
	// insert the topic finding
	await db
		.insert(findings)
		// the finding carries the score and relevance explanation, plus the scan that produced them
		.values({
			topicId: scan.topicId,
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

// summarize the scan into the report the topic card shows, grounded in what this Scan actually did
async function summarizeScan(
	topicContext: TopicContext,
	reviewOutcome: ReviewOutcome,
	scannedSources: ScannedSource[],
	budget: Budget,
	litellmApiKey?: string,
): Promise<string> {
	// date the report for its headline
	const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })

	// fetch and write the report prompt over the scan's real outcomes
	const reportPrompt = await buildScanReportPrompt({
		topicName: topicContext.name,
		topicContext: topicContext.text,
		// the date heads the report and the tallies ground it
		date,
		reviewOutcome,
		scannedSources,
		budget,
	})

	// the output is the report text and model usage tokens, linking the registry version to the trace
	const { text, usage } = await generateText({
		model: cheapModel(litellmApiKey),
		prompt: reportPrompt.prompt,
		...promptTelemetry(reportPrompt),
	})

	// track the report cost from the cheap model scoring bucket
	charge(budget, "scoringCheap", tokenCost(usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))
	return text.trim()
}

// whether a Resource carries any adapter-native text to hash and embed like a title or a snippet
function hasNativeText(resource: Resource): boolean {
	return Boolean(resource.title?.trim() || resource.snippet?.trim())
}

// the document text to embed: the capped title and snippet, falling back to the url when both are empty
function embedText(resource: Pick<Resource, "title" | "snippet" | "url">): string {
	// join title and snippet, then cap the text to bound token limits
	const text = `${resource.title ?? ""}\n${resource.snippet ?? ""}`.trim()
	return (text || resource.url).slice(0, MAX_EMBED_CHARS)
}

// embed a query — the topic context — wrapped in qwen3's Instruct and Query template, through the truncating helper
async function embedQuery(text: string, litellmApiKey?: string): Promise<number[]> {
	return embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${text}`, litellmApiKey)
}

// a rough token estimate for the embedding cost, since the truncating helper returns only the vector. about four chars per token
function estimateEmbedTokens(text: string): number {
	return Math.ceil(text.length / 4)
}

// stable sha256 over the normalized native text so content-level duplicates hash alike across sources
export function toContentHash(title: string | null, snippet: string | null): string {
	// normalize then hash. empty parts are fine, this only needs to be deterministic
	const text = normalizeText(`${title ?? ""}\n${snippet ?? ""}`)
	return new Bun.CryptoHasher("sha256").update(text).digest("hex")
}

// lowercase and collapse whitespace so that trivial formatting differences don't defeat the hash
export function normalizeText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim()
}

// build the scoring prompt from summarize-resource.md. the relevance explanation is only requested from the premium tier model
export async function buildScorePrompt(
	resourceContent: string,
	topicContext: string,
	shouldWriteRelevanceExplanation: boolean,
): Promise<BuiltPrompt> {
	// fetch the registry version first
	const { template, name, registryPrompt } = await fetchPromptTemplate("summarize-resource")

	// the cheap tier drops the premium-tier wording, then the content is capped to bound tokens and spend
	const scoreTemplate = shouldWriteRelevanceExplanation ? template : filterPremiumPrompt(template)
	const prompt = writePrompt(scoreTemplate, {
		topicContext,
		resourceContent: resourceContent.slice(0, MAX_SCORE_CHARS),
	})
	return { prompt, name, registryPrompt }
}

// build the scan report prompt from summarize-topic-scan.md over the scan's tallies, sources, and costs
export async function buildScanReportPrompt(promptData: ScanPromptData): Promise<BuiltPrompt> {
	// fetch the registry version first
	const { template, name, registryPrompt } = await fetchPromptTemplate("summarize-topic-scan")

	// the scan's identity and date pass through as-is
	const prompt = writePrompt(template, {
		topicName: promptData.topicName,
		topicContext: promptData.topicContext,
		date: promptData.date,
		// the outcome blocks are composed in code, so the template stays logic-free
		keptResourcesBlock: toKeptResourcesBlock(promptData.reviewOutcome.keptFindings),
		filteredBreakdown: toFilteredBreakdown(promptData.reviewOutcome),
		sourcesBlock: toSourcesBlock(promptData.scannedSources),
		costLine: toCostLine(promptData.budget),
	})
	return { prompt, name, registryPrompt }
}

// the kept findings block: title, url, score, and the reader-facing note, capped with the overflow named
function toKeptResourcesBlock(keptFindings: KeptFinding[]): string {
	// nothing kept still renders a truthful block
	if (keptFindings.length === 0) {
		return "none"
	}

	// one entry per kept finding up to the cap
	const lines = keptFindings.slice(0, MAX_TOPIC_SCAN_REPORT_FINDINGS).map((finding) => {
		const note = finding.relevanceExplanation || "no note"
		return `- ${finding.title ?? finding.url} — ${finding.url} — score ${finding.relevanceScore.toFixed(2)}\n  note: ${note}`
	})

	// name the truncation so the model never sees a silent cap
	const overflowCount = keptFindings.length - MAX_TOPIC_SCAN_REPORT_FINDINGS
	if (overflowCount > 0) {
		lines.push(`…and ${overflowCount} more kept findings not listed`)
	}
	return lines.join("\n")
}

// per-cause filter counts plus the deferred and failed tallies, spelled out even at zero
function toFilteredBreakdown(reviewOutcome: ReviewOutcome): string {
	// one line per drop cause, then the deferred and failed counts
	const causeLines = Object.entries(reviewOutcome.filteredCounts).map(([reason, count]) => `- ${reason}: ${count}`)
	return [
		...causeLines,
		`- deferred by the spend cap: ${reviewOutcome.deferredCount}`,
		`- failed during review: ${reviewOutcome.failedCount}`,
	].join("\n")
}

// one line per Source: its kind, how it ended, and any fallback degradation
function toSourcesBlock(scannedSources: ScannedSource[]): string {
	// a scan can run with no sources recorded
	if (scannedSources.length === 0) {
		return "none recorded"
	}

	// describe each source outcome
	return scannedSources
		.map((source) => {
			const fallback = source.fallbackMode ? ` — fell back to ${source.fallbackMode}` : ""
			return `- ${source.sourceKind}: ${source.status}${fallback}`
		})
		.join("\n")
}

// the total spend with its per-stage breakdown
function toCostLine(budget: Budget): string {
	const { embedding, fetch, scoringCheap, scoringPremium } = budget.stageCosts
	return `total $${budget.spent.toFixed(4)} — embedding $${embedding.toFixed(4)}, fetch $${fetch.toFixed(4)}, cheap scoring $${scoringCheap.toFixed(4)}, premium scoring $${scoringPremium.toFixed(4)}`
}

// fold one Resource's outcome into the running totals
function trackOutcomes(reviewOutcome: ReviewOutcome, resourceOutcome: ResourceOutcome): void {
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

// the filtered total the Scan records is the sum across drop causes
function countFilteredResources(reviewOutcome: ReviewOutcome): number {
	return Object.values(reviewOutcome.filteredCounts).reduce((sum, count) => sum + count, 0)
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
	return score >= REVIEW_PROMOTION_THRESHOLD
}

// paid tasks may run only while the Scan is under its spend ceiling
export function canSpend(budget: Budget): boolean {
	return budget.spent < budget.cap
}

// a resource may be scored only while the topic scan is under both its dollar ceiling and its scored-resource limit
export function canPay(budget: Budget): boolean {
	return budget.spent < budget.cap && scoredCount(budget) < budget.maxScoredResources
}

// how many resources the topic scan has scored so far
// the count a fetch outcome increments. the two are named apart so an outcome reads as what happened, not as a tally
export function toFetchCountKey(fetchOutcome: FetchOutcome): keyof FetchOutcomeCounts {
	// each outcome has exactly one count, so a new outcome fails to compile until its count exists
	const countKeys: Record<FetchOutcome, keyof FetchOutcomeCounts> = {
		reused: "reusedCount",
		revalidated: "revalidatedCount",
		fetched: "fetchedCount",
	}
	return countKeys[fetchOutcome]
}

export function scoredCount(budget: Budget): number {
	return budget.fetchCounts.reusedCount + budget.fetchCounts.revalidatedCount + budget.fetchCounts.fetchedCount
}

// whether stored content has outlived the ttl window and needs revalidating or refetching before it is scored again
export function isContentStale(fetchedAt: Date, now: Date, ttlMs: number): boolean {
	return now.getTime() - fetchedAt.getTime() >= ttlMs
}

// the fields that a fetch writes to the Resource row, plus the text it scores.
// a body written to object storage is scored in memory and keeps its key.
// an empty scrape or a failed write scores the snippet instead and keeps no key
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

// a fresh zeroed review outcome to track outcomes into
function emptyReviewOutcome(): ReviewOutcome {
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

// the empty summary for a topic scan to hydrate
function emptyReviewSummary(): ReviewSummary {
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

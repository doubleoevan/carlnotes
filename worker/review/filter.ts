// the unpaid stages that decide
import { reportError } from "@shared/monitoring"
import { cosineSimilarity } from "ai"
import { and, cosineDistance, eq, inArray, isNotNull, lt, notInArray, or, sql } from "drizzle-orm"
import { db } from "../../db"
import { EMBED_MODEL_NAME, findings, resources, sources } from "../../db/schema"
import { toTopicContextHash } from "../attach"
import { type Budget, canSpend, charge, EMBED_COST_PER_MILLION_TOKENS, tokenCost } from "../budget"
import type { NewResource } from "../ingest/ingester"
import { embedVector, embedVectors } from "../models"
import { type ResourceOutcome, type ReviewOutcome, trackOutcomes } from "./track"

// how close two embeddings must be for the later Resource to count as a duplicate of the earlier one
const NEAR_DUPLICATE_DISTANCE = 0.05

// the relevance bar each resource kind is measured against
const RELEVANCE_THRESHOLDS: Record<Resource["kind"], number> = { read: 0.35, watch: 0.24, listen: 0.24 }

// the text limit that bounds embedding tokens and spend
const MAX_EMBED_CHARS = 8000

// qwen3 is instruction-aware, so the query side is wrapped with this task instruction while documents stay plain
const EMBED_QUERY_INSTRUCTION = "Given a topic's interest description, retrieve web resources relevant to it"

// a persisted Resource record
export type Resource = typeof resources.$inferSelect

// the topic's derived context loaded once per Scan
// the topic's context: what the gate embeds, and the hash a Finding records
export type TopicContext = { name: string; text: string; embedding: number[]; contextHash: string }

// a Resource that cleared the relevance gate, with the embedding and the similarity score that ranks it
export type RelevantResource = { resource: Resource; embedding: number[]; similarity: number }

// the content hashes and embeddings this Scan dedupes each new Resource against
export type DedupeKeys = { contentHashes: Set<string>; embeddings: number[][] }

// what the relevance gate makes of one Resource: a relevant one for the ranked pass, or an outcome to record now
type RelevanceGateOutcome = { status: "relevant"; relevantResource: RelevantResource } | ResourceOutcome

// the outcome of the batch embed pass: the vectors it produced by resource id, and the candidates whose batch failed
type EmbeddedBatchOutcome = { embeddings: Map<string, number[]>; failedIds: Set<string> }

// how many candidates go into one embed batch. embedMany splits further if the provider's own per-call limit is lower
const EMBED_BATCH_SIZE = 100

/**
 * The stored Resource rows this Scan discovered that are worth scoring. A Resource already scored for this Topic is excluded,
 * so a re-scan never pays to score the same article twice. The pages a url Source names are the exception. its content is pulled for every Scan.
 */
export async function loadResourcesToReview(
	topicId: string,
	discoveredResources: NewResource[],
	topicContextHash: string,
): Promise<Resource[]> {
	// the urls this scan discovered (already deduped by ingestion)
	const urls = discoveredResources.map((resource) => resource.url)

	// the addresses this Topic watches, which every Scan pulls again
	const urlSources = await db
		.select({ config: sources.config })
		.from(sources)
		.where(and(eq(sources.topicId, topicId), eq(sources.kind, "url")))
	const sourceUrls = urlSources
		.map((urlSource) => urlSource.config?.url)
		.filter((url): url is string => typeof url === "string")

	// the Resources already reviewed against this context and content
	const reviewedResourceIds = db
		.select({ id: findings.resourceId })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(
			and(
				eq(findings.topicId, topicId),
				eq(findings.reviewedContextHash, topicContextHash),
				sql`${findings.reviewedContentHash} is not distinct from ${resources.contentHash}`,
			),
		)

	// a Resource is worth scoring when no Finding has reviewed it against this context and content.
	// a watched url Source is re-read every Scan, whatever it scored last time
	const needsScoring =
		sourceUrls.length > 0
			? or(notInArray(resources.id, reviewedResourceIds), inArray(resources.url, sourceUrls))
			: notInArray(resources.id, reviewedResourceIds)

	// the Resources this Scan may score: the ones it discovered, plus every Resource the Topic already
	// holds a Finding for, since a bookmarked or rated Finding outlives the feed it came from
	const topicResourceIds = db.select({ id: findings.resourceId }).from(findings).where(eq(findings.topicId, topicId))
	const isTopicResource =
		urls.length > 0
			? or(inArray(resources.url, urls), inArray(resources.id, topicResourceIds))
			: inArray(resources.id, topicResourceIds)

	// the rows worth paying to score
	return db.select().from(resources).where(and(isTopicResource, needsScoring))
}

/**
 * Builds the one context text a Scan reviews against: the topic's name, its prompt, and its attachments.
 */
export function toTopicContextText(topicScanContext: { name: string; context: string }): string {
	const { name, context } = topicScanContext
	return [name, context.trim()].filter(Boolean).join("\n\n").slice(0, MAX_EMBED_CHARS)
}

/**
 * Embed the topic's context for the relevance gate: its name, its prompt, and its attachments' contexts.
 */
export async function loadTopicContext(
	topicScanContext: { name: string; context: string },
	budget: Budget,
	litellmApiKey?: string,
): Promise<TopicContext> {
	// always include the topic name in the scan context
	const text = toTopicContextText(topicScanContext)

	// embed the context as the query side once and update the estimated embedding cost
	const embedding = await embedQuery(text, litellmApiKey)
	charge(budget, "embedding", tokenCost(estimateEmbedTokens(text), EMBED_COST_PER_MILLION_TOKENS))
	return { name: topicScanContext.name, text, embedding, contextHash: toTopicContextHash(text) }
}

/**
 * Embed every candidate and keep the ones relevant to the topic, recording the outcome of the ones dropped.
 * Embedding is the only metered work here, so a candidate past the Scan's limit is deferred instead of being embedded.
 */
export async function gateResources(
	resourcesToReview: Resource[],
	topicContext: TopicContext,
	reviewOutcome: ReviewOutcome,
	budget: Budget,
	litellmApiKey?: string,
	stopSignal?: AbortSignal,
): Promise<RelevantResource[]> {
	// embed the candidates with no stored vector in batched calls first, one HTTP request per chunk
	const embeddedBatchOutcome = await embedMissingVectors(resourcesToReview, budget, litellmApiKey, stopSignal)

	// a relevant Resource goes on to the ranked pass. anything else is already a finished outcome
	const relevantResources: RelevantResource[] = []
	for (const resource of resourcesToReview) {
		// a stopped Scan leaves the rest of the candidates for the next scan instead of walking the list to no end
		if (stopSignal?.aborted) {
			break
		}
		const gateOutcome = gateResource(resource, embeddedBatchOutcome, topicContext)
		if (gateOutcome.status === "relevant") {
			relevantResources.push(gateOutcome.relevantResource)
			continue
		}

		// filtered or failed, so it is counted here and never reaches the ranked pass
		trackOutcomes(reviewOutcome, gateOutcome)
	}

	// the relevant Resources are still in discovery order. the reviewScan caller ranks them before anything paid runs
	return relevantResources
}

/**
 * Drop the relevant Resources that duplicate one this Scan already let through, returning the rest in ranked order.
 * This walk stays sequential, so the highest-ranked member of a duplicate set is the one that wins the slot.
 */
export async function dedupeResources(
	relevantResources: RelevantResource[],
	candidateIds: string[],
	reviewOutcome: ReviewOutcome,
): Promise<Resource[]> {
	const dedupeKeys: DedupeKeys = { contentHashes: new Set(), embeddings: [] }
	const resourcesToScore: Resource[] = []

	// each Resource compares against what came before it, so the dedupe keys grow as the walk goes
	for (const relevantResource of relevantResources) {
		const dedupeOutcome = await dedupeResource(relevantResource, candidateIds, dedupeKeys)
		if (dedupeOutcome) {
			trackOutcomes(reviewOutcome, dedupeOutcome)
			continue
		}
		resourcesToScore.push(toResourceWithContentHash(relevantResource.resource))
	}

	// still best-first, which is the order the paid pass uses for its limit
	return resourcesToScore
}

/**
 * Orders the relevant Resources best-first, so a per-Scan limit defers the least relevant one.
 */
export function rankBySimilarity(relevantResources: RelevantResource[]): RelevantResource[] {
	return [...relevantResources].sort((first, second) => second.similarity - first.similarity)
}

// measure one candidate against the topic context, using its stored vector or the one the batch pass just embedded
function gateResource(
	resource: Resource,
	embeddedBatch: EmbeddedBatchOutcome,
	topicContext: TopicContext,
): RelevanceGateOutcome {
	// reuse a Resource's existing global embedding
	const embedding = resource.embedding ?? embeddedBatch.embeddings.get(resource.id)
	if (!embedding) {
		return embeddedBatch.failedIds.has(resource.id) ? { status: "failed" } : { status: "deferred" }
	}

	// the relevance gate, measured against this resource kind's own bar
	const similarity = cosineSimilarity(embedding, topicContext.embedding)
	if (!isRelevant(similarity, resource.kind)) {
		return { status: "filtered", reason: "below relevance threshold" }
	}

	// the relevant Resource includes its vector too, which the ranked pass dedupes against
	return { status: "relevant", relevantResource: { resource, embedding, similarity } }
}

// embed every candidate with no stored vector, a chunk at a time, stopping when finished or the budget runs out
async function embedMissingVectors(
	resourcesToReview: Resource[],
	budget: Budget,
	litellmApiKey?: string,
	stopSignal?: AbortSignal,
): Promise<EmbeddedBatchOutcome> {
	// only a candidate with no stored vector costs anything to embed
	const embeddedBatchOutcome: EmbeddedBatchOutcome = { embeddings: new Map(), failedIds: new Set() }
	const resourcesWithoutEmbeddings = resourcesToReview.filter((resource) => !resource.embedding)
	for (let start = 0; start < resourcesWithoutEmbeddings.length; start += EMBED_BATCH_SIZE) {
		// embedding costs money, so check the limit before each chunk
		if (!canSpend(budget, stopSignal)) {
			break
		}
		const resourcesBatch = resourcesWithoutEmbeddings.slice(start, start + EMBED_BATCH_SIZE)
		await embedResourcesBatch(resourcesBatch, embeddedBatchOutcome, budget, litellmApiKey)
	}
	return embeddedBatchOutcome
}

// embed one batch of resources in a single call, storing each vector and charging its estimated cost
async function embedResourcesBatch(
	resourcesBatch: Resource[],
	embeddedBatch: EmbeddedBatchOutcome,
	budget: Budget,
	litellmApiKey?: string,
): Promise<void> {
	try {
		// embed the batch's document texts in one call, returned in the batch's order
		const documentTexts = resourcesBatch.map(embedText)
		const vectors = await embedVectors(documentTexts, litellmApiKey)

		// store each vector and charge its own estimated cost, the same writes the one-at-a-time path made
		await Promise.all(
			resourcesBatch.map(async (resource, index) => {
				// a missing vector means the batch and its results can no longer be paired up
				const embedding = vectors[index]
				if (!embedding) {
					throw new Error(`embed batch returned ${vectors.length} vectors for ${resourcesBatch.length} texts`)
				}
				charge(
					budget,
					"embedding",
					tokenCost(estimateEmbedTokens(documentTexts[index] ?? ""), EMBED_COST_PER_MILLION_TOKENS),
				)
				await saveResourceEmbedding(resource.id, embedding)
				embeddedBatch.embeddings.set(resource.id, embedding)
			}),
		)
	} catch (error) {
		// a candidate that never got measured is a Finding the user silently never sees
		for (const resource of resourcesBatch) {
			embeddedBatch.failedIds.add(resource.id)
		}
		console.error(`relevance gate embed batch of ${resourcesBatch.length} failed`, error)
		reportError(error, "embed-filter", { batchSize: String(resourcesBatch.length) })
	}
}

// run one relevant Resource through both dedupe stages, returning a filtered outcome or null when it is no duplicate
async function dedupeResource(
	relevantResource: RelevantResource,
	candidateIds: string[],
	dedupeKeys: DedupeKeys,
): Promise<ResourceOutcome | null> {
	const { resource, embedding } = relevantResource
	// the content hash over the native text, only when the Resource has content. empty rows must not collapse to one hash
	const contentHash = hasNativeText(resource) ? toContentHash(resource.title, resource.snippet) : null

	// stage 1 checks for a content-level duplicate, of a sibling this Scan let through or of a Resource an earlier
	if (contentHash !== null) {
		const isHashDuplicate =
			dedupeKeys.contentHashes.has(contentHash) || (await hasStoredHash(contentHash, candidateIds))
		if (isHashDuplicate) {
			return { status: "filtered", reason: "duplicate content" }
		}
	}

	// stage 2 checks for a near-duplicate, of a sibling this Scan let through or of a Resource an earlier Scan stored
	if (hasNearDuplicateKey(dedupeKeys, embedding) || (await hasNearDuplicate(embedding, candidateIds))) {
		return { status: "filtered", reason: "near-duplicate" }
	}

	// no duplicate. persist the hash for later Scans and remember both keys so a lower-ranked sibling dedupes against this one
	if (contentHash !== null) {
		dedupeKeys.contentHashes.add(contentHash)
		await db.update(resources).set({ contentHash }).where(eq(resources.id, resource.id))
	}
	dedupeKeys.embeddings.push(embedding)
	return null
}

/**
 * Returns the Resource with the content hash the dedupe pass just wrote to its row.
 */
function toResourceWithContentHash(resource: Resource): Resource {
	return {
		...resource,
		contentHash: hasNativeText(resource) ? toContentHash(resource.title, resource.snippet) : resource.contentHash,
	}
}

// a Resource outside this Scan that already has this content hash makes this a content-level duplicate
async function hasStoredHash(hash: string, candidateIds: string[]): Promise<boolean> {
	// look for a stored Resource with the same hash
	const [duplicate] = await db
		.select({ id: resources.id })
		.from(resources)
		.where(and(eq(resources.contentHash, hash), notInArray(resources.id, candidateIds)))
		.limit(1)
	return duplicate !== undefined
}

// store a Resource's new vector, saved with the model name so a later model or dimension change is a detectable backfill
async function saveResourceEmbedding(resourceId: string, embedding: number[]): Promise<void> {
	await db.update(resources).set({ embedding, embeddingModel: EMBED_MODEL_NAME }).where(eq(resources.id, resourceId))
}

// whether this embedding has a resource outside of these resource ids close enough to be considered a duplicate
async function hasNearDuplicate(embedding: number[], resourceIds: string[]): Promise<boolean> {
	// get resource neighbors within the embedding's duplicate range
	const distanceExpression = cosineDistance(resources.embedding, embedding)
	const nearestResourceNeighbors = await db
		.select({ id: resources.id })
		.from(resources)
		.where(and(isNotNull(resources.embedding), lt(distanceExpression, NEAR_DUPLICATE_DISTANCE)))
		.orderBy(distanceExpression)
		.limit(resourceIds.length + 1)

	const resourceIdSet = new Set(resourceIds)
	return nearestResourceNeighbors.some((nearestNeighbor) => !resourceIdSet.has(nearestNeighbor.id))
}

/**
 * Whether a candidate is a near-duplicate of one this Scan already let through.
 */
export function hasNearDuplicateKey(dedupeKeys: DedupeKeys, embedding: number[]): boolean {
	// cosine similarity is the complement of the distance the stored query orders by, so both paths share one threshold
	return dedupeKeys.embeddings.some((keyEmbedding) => isNearDuplicate(1 - cosineSimilarity(embedding, keyEmbedding)))
}

// whether a Resource includes any ingester-native text to hash and embed like a title or a snippet
function hasNativeText(resource: Resource): boolean {
	return Boolean(resource.title?.trim() || resource.snippet?.trim())
}

// the document text to embed: the limited title and snippet, falling back to the url when both are empty
function embedText(resource: Pick<Resource, "title" | "snippet" | "url">): string {
	// join title and snippet, then limit the text to bound token limits
	const text = `${resource.title ?? ""}\n${resource.snippet ?? ""}`.trim()
	return (text || resource.url).slice(0, MAX_EMBED_CHARS)
}

/**
 * Embed a query: the topic context wrapped in qwen3's Instruct and Query template, through the truncating helper.
 */
export async function embedQuery(text: string, litellmApiKey?: string): Promise<number[]> {
	return embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${text}`, litellmApiKey)
}

// a rough token estimate for the embedding cost
function estimateEmbedTokens(text: string): number {
	return Math.ceil(text.length / 4)
}

/**
 * A stable sha256 over the normalized native text, so content-level duplicates hash alike across sources.
 */
export function toContentHash(title: string | null, snippet: string | null): string {
	// normalize then hash. empty parts are fine, this only needs to be deterministic
	const text = normalizeText(`${title ?? ""}\n${snippet ?? ""}`)
	return new Bun.CryptoHasher("sha256").update(text).digest("hex")
}

/**
 * Lowercase and collapse whitespace so that trivial formatting differences don't defeat the hash.
 */
export function normalizeText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Whether a cosine distance is close enough to mark a near-duplicate resource.
 */
export function isNearDuplicate(distance: number): boolean {
	return distance < NEAR_DUPLICATE_DISTANCE
}

/**
 * Whether a similarity clears the resource relevance gate for its Resource kind.
 */
export function isRelevant(similarity: number, kind: Resource["kind"]): boolean {
	return similarity >= RELEVANCE_THRESHOLDS[kind]
}

// the unpaid stages that decide
import { reportError } from "@shared/monitoring"
import { cosineSimilarity } from "ai"
import { and, cosineDistance, eq, inArray, isNotNull, lt, notInArray, or } from "drizzle-orm"
import { db } from "../../db"
import { EMBED_MODEL_NAME, findings, resources, sources } from "../../db/schema"
import { buildTopicScanContext } from "../attach"
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
export type TopicContext = { name: string; text: string; embedding: number[] }

// a Resource that cleared the relevance gate, with the embedding and the similarity score that ranks it
export type SurvivingResource = { resource: Resource; embedding: number[]; similarity: number }

// the dedupe keys for what this Scan has admitted
export type AdmittedResources = { contentHashes: Set<string>; embeddings: number[][] }

// what the relevance gate makes of one Resource: a survivor for the ranked pass, or an outcome to record now
type RelevanceGateOutcome = { status: "survived"; survivor: SurvivingResource } | ResourceOutcome

// the outcome of the batch embed pass: the vectors it produced by resource id, and the candidates whose batch failed
type EmbeddedBatchOutcome = { embeddings: Map<string, number[]>; failedIds: Set<string> }

// how many candidates go into one embed batch. embedMany splits further if the provider's own per-call limit is lower
const EMBED_BATCH_SIZE = 100

/**
 * The stored Resource rows this Scan discovered that are worth scoring. A Resource already scored for this Topic is excluded,
 * so a re-scan never pays to score the same article twice. The pages a url Source names are the exception. its content is pulled for every Scan.
 */
export async function loadUnscoredResources(topicId: string, discoveredResources: NewResource[]): Promise<Resource[]> {
	// the urls this scan discovered (already deduped by ingestion)
	const urls = discoveredResources.map((resource) => resource.url)
	if (urls.length === 0) {
		return []
	}

	// the addresses this Topic watches, which every Scan pulls again
	const urlSources = await db
		.select({ config: sources.config })
		.from(sources)
		.where(and(eq(sources.topicId, topicId), eq(sources.kind, "url")))
	const sourceUrls = urlSources
		.map((urlSource) => urlSource.config?.url)
		.filter((url): url is string => typeof url === "string")

	// exclude the Resources already scored for this Topic, then load the rest by url
	const scoredResourceIds = db.select({ id: findings.resourceId }).from(findings).where(eq(findings.topicId, topicId))

	// a source url is always worth reading again, no matter what it scored last time
	const needsScoring =
		sourceUrls.length > 0
			? or(notInArray(resources.id, scoredResourceIds), inArray(resources.url, sourceUrls))
			: notInArray(resources.id, scoredResourceIds)

	// the stored rows for what this Scan discovered, narrowed to the ones worth paying to score
	return db
		.select()
		.from(resources)
		.where(and(inArray(resources.url, urls), needsScoring))
}

/**
 * Embed the topic's context for the relevance gate: its name, its prompt, and its attachments' contexts.
 */
export async function loadTopicContext(topicId: string, budget: Budget, litellmApiKey?: string): Promise<TopicContext> {
	// always include the topic name in the scan context
	const { name, context } = await buildTopicScanContext(topicId)
	const text = [name, context.trim()].filter(Boolean).join("\n\n").slice(0, MAX_EMBED_CHARS)

	// embed the context as the query side once and update the estimated embedding cost
	const embedding = await embedQuery(text, litellmApiKey)
	charge(budget, "embedding", tokenCost(estimateEmbedTokens(text), EMBED_COST_PER_MILLION_TOKENS))
	return { name, text, embedding }
}

/**
 * Embed every candidate and keep the ones relevant to the topic, recording the outcome of the ones dropped.
 * Embedding is the only metered work here, so a candidate past the Scan's limit is deferred instead of being embedded.
 */
export async function gateResources(
	unscoredResources: Resource[],
	topicContext: TopicContext,
	reviewOutcome: ReviewOutcome,
	budget: Budget,
	litellmApiKey?: string,
	stopSignal?: AbortSignal,
): Promise<SurvivingResource[]> {
	// embed the candidates with no stored vector in batched calls first, one HTTP request per chunk
	const embeddedBatchOutcome = await embedMissingVectors(unscoredResources, budget, litellmApiKey, stopSignal)

	// a survivor goes on to the ranked pass. anything else is already a finished outcome
	const survivors: SurvivingResource[] = []
	for (const resource of unscoredResources) {
		// a stopped Scan leaves the rest of the candidates for the next scan instead of walking the list to no end
		if (stopSignal?.aborted) {
			break
		}
		const gateOutcome = gateResource(resource, embeddedBatchOutcome, topicContext)
		if (gateOutcome.status === "survived") {
			survivors.push(gateOutcome.survivor)
			continue
		}

		// filtered or failed, so it is counted here and never reaches the ranked pass
		trackOutcomes(reviewOutcome, gateOutcome)
	}

	// survivors are still in discovery order. the reviewScan caller ranks them before anything paid runs
	return survivors
}

/**
 * Drop the survivors that duplicate something already admitted, returning the rest in the order they were ranked.
 * This walk stays sequential, so the highest-ranked member of a duplicate set is the one that wins the slot to get admitted.
 */
export async function admitResources(
	survivors: SurvivingResource[],
	candidateIds: string[],
	reviewOutcome: ReviewOutcome,
): Promise<Resource[]> {
	const admitted: AdmittedResources = { contentHashes: new Set(), embeddings: [] }
	const admittedResources: Resource[] = []

	// each admission compares against what came before it, so the dedupe keys grow as the walk goes
	for (const survivor of survivors) {
		const admissionOutcome = await admitResource(survivor, candidateIds, admitted)
		if (admissionOutcome) {
			trackOutcomes(reviewOutcome, admissionOutcome)
			continue
		}
		admittedResources.push(survivor.resource)
	}

	// still best-first, which is the order the paid pass uses for its limit
	return admittedResources
}

/**
 * Orders relevance-gate survivors best-first, so a per-Scan limit defers the least relevant resource.
 */
export function rankBySimilarity(survivors: SurvivingResource[]): SurvivingResource[] {
	return [...survivors].sort((first, second) => second.similarity - first.similarity)
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

	// the survivor includes its vector too, which the ranked pass dedupes against
	return { status: "survived", survivor: { resource, embedding, similarity } }
}

// embed every candidate with no stored vector, a chunk at a time, stopping when finished or the budget runs out
async function embedMissingVectors(
	unscoredResources: Resource[],
	budget: Budget,
	litellmApiKey?: string,
	stopSignal?: AbortSignal,
): Promise<EmbeddedBatchOutcome> {
	// only a candidate with no stored vector costs anything to embed
	const embeddedBatchOutcome: EmbeddedBatchOutcome = { embeddings: new Map(), failedIds: new Set() }
	const resourcesWithoutEmbeddings = unscoredResources.filter((resource) => !resource.embedding)
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

// run one surviving resource through both dedupe stages, returning a filtered outcome or null if it is admitted
async function admitResource(
	survivingResource: SurvivingResource,
	candidateIds: string[],
	admitted: AdmittedResources,
): Promise<ResourceOutcome | null> {
	const { resource, embedding } = survivingResource
	// the content hash over the native text, only when the Resource has content. empty rows must not collapse to one hash
	const contentHash = hasNativeText(resource) ? toContentHash(resource.title, resource.snippet) : null

	// stage 1 checks for a content-level duplicate, of a sibling this Scan admitted or of a Resource an earlier
	if (contentHash !== null) {
		const isHashDuplicate = admitted.contentHashes.has(contentHash) || (await hasStoredHash(contentHash, candidateIds))
		if (isHashDuplicate) {
			return { status: "filtered", reason: "duplicate content" }
		}
	}

	// stage 2 checks for a near-duplicate, of a sibling this Scan admitted or of a Resource an earlier Scan stored
	if (hasAdmittedNearDuplicate(admitted, embedding) || (await hasNearDuplicate(embedding, candidateIds))) {
		return { status: "filtered", reason: "near-duplicate" }
	}

	// admitted. persist the hash for later Scans and remember both keys so a lower-ranked sibling dedupes against this one
	if (contentHash !== null) {
		admitted.contentHashes.add(contentHash)
		await db.update(resources).set({ contentHash }).where(eq(resources.id, resource.id))
	}
	admitted.embeddings.push(embedding)
	return null
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
 * Whether a candidate is a near-duplicate of one this Scan already admitted.
 */
export function hasAdmittedNearDuplicate(admitted: AdmittedResources, embedding: number[]): boolean {
	// cosine similarity is the complement of the distance the stored query orders by, so both paths share one threshold
	return admitted.embeddings.some((admittedEmbedding) =>
		isNearDuplicate(1 - cosineSimilarity(embedding, admittedEmbedding)),
	)
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

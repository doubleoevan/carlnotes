// the unpaid stages that decide: the Resources worth scoring, the topic context they are measured against, and the
// relevance gate over their embeddings

import {
	AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS,
	PERSONAL_SOURCE_SCORE_BONUS,
	type PersonalSourceScoreBonus,
} from "@carlnotes/contracts/sourceScoring"
import { db } from "@carlnotes/db"
import { EMBED_MODEL_NAME, findings, resources } from "@carlnotes/db/schema/scans"
import { sources } from "@carlnotes/db/schema/topics"
import {
	type Budget,
	canSpend,
	charge,
	EMBED_COST_PER_MILLION_TOKENS,
	toEstimatedTokens,
	tokenCost,
} from "@carlnotes/models/budget"
import { runModelCall } from "@carlnotes/models/modelCallRetry"
import { embedVectors } from "@carlnotes/models/models"
import { reportError } from "@carlnotes/server/monitoring"
import { cosineSimilarity } from "ai"
import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm"
import type { NewResource } from "../ingest/ingester"
import { toCanonicalUrl } from "../ingest/normalize"
import type { TopicContext } from "./topicContext"
import { type ResourceOutcome, type ReviewOutcome, trackOutcomes } from "./track"

// the relevance bar each resource kind is measured against
const RELEVANCE_THRESHOLDS: Record<Resource["kind"], number> = { read: 0.35, watch: 0.24, listen: 0.24 }

// the text limit that bounds embedding tokens and spend
const MAX_EMBED_CHARS = 8000

// a persisted Resource with the current Topic queue's transient score bonus
export type Resource = typeof resources.$inferSelect & { personalSourceScoreBonus?: PersonalSourceScoreBonus }

// a Resource that cleared the relevance gate, with the embedding and the similarity score that ranks it
export type RelevantResource = { resource: Resource; embedding: number[] | null; similarity: number }

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
export async function loadResourcesToReview({
	topicId,
	discoveredResources,
	topicContextHash,
	personalSourceScoreBonuses = new Map(),
}: {
	topicId: string
	discoveredResources: NewResource[]
	topicContextHash: string
	personalSourceScoreBonuses?: ReadonlyMap<string, PersonalSourceScoreBonus>
}): Promise<Resource[]> {
	// the urls this scan discovered (already deduped by ingestion)
	const urls = discoveredResources.map((resource) => resource.url)

	// the url Sources' own pages, which every Scan reads again
	const urlSourcePageUrls = await loadUrlSourcePageUrls(topicId)

	// a stronger personal contribution earns a fresh review even when content and context match
	const fullBonusUrls = [...personalSourceScoreBonuses]
		.filter(([, bonus]) => bonus === PERSONAL_SOURCE_SCORE_BONUS)
		.map(([url]) => url)
	const halfBonusUrls = [...personalSourceScoreBonuses]
		.filter(([, bonus]) => bonus === AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS)
		.map(([url]) => url)
	const requiredBonus = sql`case when ${inArray(resources.url, fullBonusUrls)} then ${PERSONAL_SOURCE_SCORE_BONUS}::real when ${inArray(resources.url, halfBonusUrls)} then ${AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS}::real else 0::real end`

	// the Resources already reviewed against this context and content, and the Resources rated thumbs down.
	// a Resource rated thumbs down never scores again
	const reviewedResourceIds = db
		.select({ id: findings.resourceId })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(
			and(
				eq(findings.topicId, topicId),
				or(
					and(
						eq(findings.reviewedContextHash, topicContextHash),
						sql`${findings.reviewedContentHash} is not distinct from ${resources.contentHash}`,
						sql`${findings.personalSourceScoreBonus} >= ${requiredBonus}`,
					),
					eq(findings.rating, "down"),
				),
			),
		)

	// a Resource is worth scoring when no Finding has reviewed it against this context and content.
	// a url Source's own page is re-read every Scan, whatever it scored last time
	const needsScoring = or(notInArray(resources.id, reviewedResourceIds), inArray(resources.url, urlSourcePageUrls))

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
 * Loads the canonical urls of a Topic's url Sources, which are the urls of the pages those Sources read.
 */
export async function loadUrlSourcePageUrls(topicId: string): Promise<string[]> {
	// the Topic's url Sources
	const urlSources = await db
		.select({ config: sources.config })
		.from(sources)
		.where(and(eq(sources.topicId, topicId), eq(sources.kind, "url")))

	// each saved url in the canonical form that the url ingester stores its page under
	return urlSources
		.map((urlSource) => urlSource.config?.url)
		.filter((url): url is string => typeof url === "string")
		.map(toCanonicalUrl)
}

/**
 * Gates ordinary candidates by embedding and passes matched Personal sources links directly to review.
 * Embedding is the only metered work here, so a candidate past the Scan's limit is deferred instead of being embedded.
 * A candidate in gateExemptResourceIds passes whatever it measures: a Resource the Topic already holds a Finding for,
 * and a url Source's own page. Personal-source candidates need no embedding.
 */
export async function gateResources(
	resourcesToReview: Resource[],
	topicContext: TopicContext,
	reviewOutcome: ReviewOutcome,
	budget: Budget,
	litellmApiKey?: string,
	stopSignal?: AbortSignal,
	gateExemptResourceIds: Set<string> = new Set(),
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
		const gateOutcome = gateResource(
			resource,
			embeddedBatchOutcome,
			topicContext,
			gateExemptResourceIds.has(resource.id),
		)
		if (gateOutcome.status === "relevant") {
			relevantResources.push(gateOutcome.relevantResource)
			continue
		}

		// filtered or failed, so it is counted here and never reaches the ranked pass
		trackOutcomes(reviewOutcome, gateOutcome)
		if (gateOutcome.status === "filtered") {
			await reviewOutcome.onResourceConsidered?.(resource.url, {
				reviewOutcome: "rejected",
				reviewReason: gateOutcome.reason,
			})
		}
	}

	// the relevant Resources are still in discovery order. the reviewScan caller ranks them before anything paid runs
	return relevantResources
}

/**
 * Orders queued personal links first, then exempt Resources, then the strongest embedding matches.
 */
export function rankBySimilarity(
	relevantResources: RelevantResource[],
	gateExemptResourceIds: ReadonlySet<string> = new Set(),
): RelevantResource[] {
	// queued personal links lead, then existing Findings and chosen pages, then embedding relevance
	return [...relevantResources].sort(
		(first, second) =>
			(second.resource.personalSourceScoreBonus ?? 0) - (first.resource.personalSourceScoreBonus ?? 0) ||
			Number(gateExemptResourceIds.has(second.resource.id)) - Number(gateExemptResourceIds.has(first.resource.id)) ||
			second.similarity - first.similarity,
	)
}

// measure one candidate against the topic context, using its stored vector or the one the batch pass just embedded
function gateResource(
	resource: Resource,
	embeddedBatch: EmbeddedBatchOutcome,
	topicContext: TopicContext,
	isGateExempt: boolean,
): RelevanceGateOutcome {
	// matched personal links reach scoring without another embedding gate
	if (resource.personalSourceScoreBonus) {
		return { status: "relevant", relevantResource: { resource, embedding: resource.embedding, similarity: 0 } }
	}

	// reuse a Resource's existing global embedding
	const embedding = resource.embedding ?? embeddedBatch.embeddings.get(resource.id)
	if (!embedding) {
		return embeddedBatch.failedIds.has(resource.id) ? { status: "failed" } : { status: "deferred" }
	}

	// the relevance gate, measured against this resource kind's own bar. an exempt Resource goes on to the model
	// whatever it measures
	const similarity = cosineSimilarity(embedding, topicContext.embedding)
	if (!isGateExempt && !isRelevant(similarity, resource.kind)) {
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
	const resourcesWithoutEmbeddings = resourcesToReview.filter(
		(resource) => !resource.embedding && !resource.personalSourceScoreBonus,
	)
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
		// embed the batch's document texts in one call, returned in the batch's order. a rate limit waits and tries again
		const documentTexts = resourcesBatch.map(embedText)
		const vectors = await runModelCall({
			runAttempt: () => embedVectors(documentTexts, { litellmApiKey, maxRetries: 0 }),
			waitDeadlineAt: budget.modelCallWaitDeadlineAt,
			label: "embedding",
		})

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
					tokenCost(toEstimatedTokens((documentTexts[index] ?? "").length), EMBED_COST_PER_MILLION_TOKENS),
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

// store a Resource's new vector, saved with the model name so a later model or dimension change is a detectable backfill
async function saveResourceEmbedding(resourceId: string, embedding: number[]): Promise<void> {
	await db.update(resources).set({ embedding, embeddingModel: EMBED_MODEL_NAME }).where(eq(resources.id, resourceId))
}

// the document text to embed: the limited title and snippet, falling back to the url when both are empty
function embedText(resource: Pick<Resource, "title" | "snippet" | "url">): string {
	// join title and snippet, then limit the text to bound token limits
	const text = `${resource.title ?? ""}\n${resource.snippet ?? ""}`.trim()
	return (text || resource.url).slice(0, MAX_EMBED_CHARS)
}

/**
 * Whether a similarity clears the resource relevance gate for its Resource kind.
 */
export function isRelevant(similarity: number, kind: Resource["kind"]): boolean {
	return similarity >= RELEVANCE_THRESHOLDS[kind]
}

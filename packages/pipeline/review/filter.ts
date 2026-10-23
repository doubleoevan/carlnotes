// the unpaid stages that decide: the Resources worth scoring, the topic context they are measured against, and the
// relevance gate over their embeddings

import { toHostWithoutWww } from "@carlnotes/contracts/seo"
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
import { embedVector, embedVectors } from "@carlnotes/models/models"
import { reportError } from "@carlnotes/server/monitoring"
import { cosineSimilarity } from "ai"
import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm"
import { toTopicContextHash } from "../attach"
import type { NewResource } from "../ingest/ingester"
import { toCanonicalUrl } from "../ingest/normalize"
import { type ResourceOutcome, type ReviewOutcome, trackOutcomes } from "./track"

// the relevance bar each resource kind is measured against
const RELEVANCE_THRESHOLDS: Record<Resource["kind"], number> = { read: 0.35, watch: 0.24, listen: 0.24 }

// the text limit that bounds embedding tokens and spend
const MAX_EMBED_CHARS = 8000

// the topic context limit for the score prompt and the scan summary. the limit fits the prompt and one full-length attachment
const MAX_TOPIC_CONTEXT_CHARS = 24_000

// how many example pages of each kind the score prompt lists
const MAX_SCORE_EXAMPLE_PAGES = 10

// qwen3 is instruction-aware, so the query side is wrapped with this task instruction while documents stay plain
const EMBED_QUERY_INSTRUCTION = "Given a topic's interest description, retrieve web resources relevant to it"

// a persisted Resource record
export type Resource = typeof resources.$inferSelect

// the topic's context. the hash covers all of the context, and the gate embeds the start of the context.
// the score text adds the pages that the topic's users liked, bookmarked, or rated down
export type TopicContext = { name: string; text: string; embedding: number[]; contextHash: string; scoreText: string }

// a page from the topic's feed that the score prompt shows as an example
export type ScoreExamplePage = { title: string | null; url: string }

// the example pages. the pages that the topic's users liked or bookmarked, and the pages that they rated down
export type ScoreExamplePages = { likedOrBookmarkedPages: ScoreExamplePage[]; ratedDownPages: ScoreExamplePage[] }

// a Resource that cleared the relevance gate, with the embedding and the similarity score that ranks it
export type RelevantResource = { resource: Resource; embedding: number[]; similarity: number }

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

	// the url Sources' own pages, which every Scan reads again
	const urlSourcePageUrls = await loadUrlSourcePageUrls(topicId)

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
 * Builds the one context text a Scan reviews against: the topic's name, its prompt, and its attachments.
 */
export function toTopicContextText(topicScanContext: { name: string; context: string }): string {
	const { name, context } = topicScanContext
	return [name, context.trim()].filter(Boolean).join("\n\n").slice(0, MAX_TOPIC_CONTEXT_CHARS)
}

/**
 * Builds the score prompt's text from the context text, then the pages that the topic's users liked or bookmarked,
 * then the pages that they rated down.
 */
export function toScoreContextText(contextText: string, scoreExamplePages: ScoreExamplePages): string {
	// list each kind of example page by title and host, under a label like an attachment's. a kind with no pages is left out
	const toExampleSections = (label: string, examplePages: ScoreExamplePage[]): string[] => {
		const examplePageLines = examplePages
			.slice(0, MAX_SCORE_EXAMPLE_PAGES)
			.map(({ title, url }) => `- ${title ?? url} (${toHostWithoutWww(url)})`)
		return examplePageLines.length > 0 ? [`[${label}]\n${examplePageLines.join("\n")}`] : []
	}
	return [
		contextText,
		...toExampleSections("pages the reader liked or bookmarked", scoreExamplePages.likedOrBookmarkedPages),
		...toExampleSections("pages the reader rated down", scoreExamplePages.ratedDownPages),
	].join("\n\n")
}

// the topic's scan context, the example pages for the score prompt, the Scan's Budget,
// and the key that the embedding bills
type LoadTopicContextOptions = {
	topicScanContext: { name: string; context: string }
	scoreExamplePages: ScoreExamplePages
	budget: Budget
	litellmApiKey?: string
}

/**
 * Embeds the start of the topic's context for the relevance gate: its name, its prompt, and its attachments' contexts.
 * The text that the score prompt reads also lists the example pages.
 */
export async function loadTopicContext({
	topicScanContext,
	scoreExamplePages,
	budget,
	litellmApiKey,
}: LoadTopicContextOptions): Promise<TopicContext> {
	// always include the topic name in the scan context
	const text = toTopicContextText(topicScanContext)

	// embed the start of the context as the query side once and update the estimated embedding cost
	const contextTextToEmbed = text.slice(0, MAX_EMBED_CHARS)
	const embedding = await embedQuery(contextTextToEmbed, litellmApiKey)
	charge(budget, "embedding", tokenCost(toEstimatedTokens(contextTextToEmbed.length), EMBED_COST_PER_MILLION_TOKENS))
	return {
		name: topicScanContext.name,
		text,
		embedding,
		contextHash: toTopicContextHash(text),
		scoreText: toScoreContextText(text, scoreExamplePages),
	}
}

/**
 * Embed every candidate and keep the ones relevant to the topic, recording the outcome of the ones dropped.
 * Embedding is the only metered work here, so a candidate past the Scan's limit is deferred instead of being embedded.
 * A candidate in gateExemptResourceIds passes whatever it measures: a Resource the Topic already holds a Finding for,
 * and a url Source's own page.
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
	}

	// the relevant Resources are still in discovery order. the reviewScan caller ranks them before anything paid runs
	return relevantResources
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
	isGateExempt: boolean,
): RelevanceGateOutcome {
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
 * Embed a query: the topic context wrapped in qwen3's Instruct and Query template, through the truncating helper.
 */
export async function embedQuery(text: string, litellmApiKey?: string): Promise<number[]> {
	return embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${text}`, litellmApiKey)
}

/**
 * Whether a similarity clears the resource relevance gate for its Resource kind.
 */
export function isRelevant(similarity: number, kind: Resource["kind"]): boolean {
	return similarity >= RELEVANCE_THRESHOLDS[kind]
}

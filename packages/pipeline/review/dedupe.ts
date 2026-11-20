// the dedupe pass over the relevant Resources: a content hash catches a copy and a near-duplicate embedding catches
// a rewrite, against what this Scan let through and what the Topic judged in an earlier Scan
import { toOneLineText } from "@carlnotes/contracts/text"
import { db } from "@carlnotes/db"
import { resources } from "@carlnotes/db/schema/scans"
import { cosineSimilarity } from "ai"
import { and, cosineDistance, eq, isNotNull, lt, notInArray } from "drizzle-orm"
import { toFallbackTitle } from "../ingest/normalize"
import type { RelevantResource, Resource } from "./filter"
import { toJudgedResourceFilter } from "./filteredFindings"
import { type ResourceOutcome, type ReviewOutcome, trackOutcomes } from "./track"

// how close two embeddings must be for the later Resource to count as a duplicate of the earlier one
const NEAR_DUPLICATE_DISTANCE = 0.05

// the content hashes and embeddings this Scan dedupes each new Resource against
export type DedupeKeys = { contentHashes: Set<string>; embeddings: number[][] }

// the Topic, the Resources the dedupe walks in ranked order, the Scan's candidates, its running totals, and the url
// Sources' own pages, which it passes through
type DedupeResourcesOptions = {
	topicId: string
	relevantResources: RelevantResource[]
	candidateIds: string[]
	reviewOutcome: ReviewOutcome
	urlSourcePageIds: Set<string>
}

// the stored Resources a candidate is compared with: the ones the Topic has judged, without this Scan's candidates
type StoredDedupeScope = { topicId: string; candidateIds: string[] }

/**
 * Drops the relevant Resources that duplicate one this Scan already let through or one the Topic judged in an earlier
 * Scan, returning the rest in ranked order. A Resource that only another Topic's Scan stored drops nothing.
 * This walk stays sequential, so the highest-ranked member of a duplicate set is the one that wins the slot.
 * A url Source's own page is never dropped.
 */
export async function dedupeResources({
	topicId,
	relevantResources,
	candidateIds,
	reviewOutcome,
	urlSourcePageIds,
}: DedupeResourcesOptions): Promise<Resource[]> {
	const dedupeKeys: DedupeKeys = { contentHashes: new Set(), embeddings: [] }
	const resourcesToScore: Resource[] = []

	// each Resource compares against what came before it, so the dedupe keys grow as the walk goes
	for (const relevantResource of relevantResources) {
		// a url Source's own page goes on to the model. its title is often only its url's last path segment
		if (urlSourcePageIds.has(relevantResource.resource.id)) {
			resourcesToScore.push(relevantResource.resource)
			continue
		}

		// any other Resource is dropped if it duplicates one before it, and kept otherwise
		const dedupeOutcome = await dedupeResource(relevantResource, { topicId, candidateIds }, dedupeKeys)
		if (dedupeOutcome) {
			trackOutcomes(reviewOutcome, dedupeOutcome)
			await reviewOutcome.onResourceConsidered?.(relevantResource.resource.url, {
				reviewOutcome: "rejected",
				reviewReason: dedupeOutcome.reason,
			})
			continue
		}
		resourcesToScore.push(toResourceWithContentHash(relevantResource.resource))
	}

	// still best-first, which is the order the paid pass uses for its limit
	return resourcesToScore
}

// run one relevant Resource through both dedupe stages, returning a filtered outcome or null when it is no duplicate
async function dedupeResource(
	relevantResource: RelevantResource,
	storedDedupeScope: StoredDedupeScope,
	dedupeKeys: DedupeKeys,
): Promise<Extract<ResourceOutcome, { status: "filtered" }> | null> {
	const { resource, embedding } = relevantResource
	// the content hash over the native text, only when the Resource has content. empty rows must not collapse to one hash
	const contentHash = hasNativeText(resource) ? toContentHash(resource.title, resource.snippet) : null

	// stage 1 checks for a content-level duplicate, of a candidate this Scan let through or of a Resource that the Topic
	// judged in an earlier Scan
	if (contentHash !== null) {
		const isHashDuplicate =
			dedupeKeys.contentHashes.has(contentHash) || (await hasStoredHash(contentHash, storedDedupeScope))
		if (isHashDuplicate) {
			return { status: "filtered", reason: "duplicate content" }
		}
	}

	// stage 2 checks for a near-duplicate, of a candidate this Scan let through or of a Resource that the Topic judged
	// in an earlier Scan
	const isNearDuplicateResource =
		embedding !== null &&
		(hasNearDuplicateKey(dedupeKeys, embedding) || (await hasNearDuplicate(embedding, storedDedupeScope)))
	if (isNearDuplicateResource) {
		return { status: "filtered", reason: "near-duplicate" }
	}

	// no duplicate. persist the hash for later Scans and remember both keys so a lower-ranked candidate dedupes against this one
	if (contentHash !== null) {
		dedupeKeys.contentHashes.add(contentHash)
		await db.update(resources).set({ contentHash }).where(eq(resources.id, resource.id))
	}

	// the vector that a lower-ranked candidate is measured against
	if (embedding) {
		dedupeKeys.embeddings.push(embedding)
	}
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

// a Resource outside this Scan that the Topic judged and that has this content hash makes this a content-level
// duplicate
async function hasStoredHash(hash: string, { topicId, candidateIds }: StoredDedupeScope): Promise<boolean> {
	// look for a judged Resource with the same hash
	const [duplicate] = await db
		.select({ id: resources.id })
		.from(resources)
		.where(
			and(eq(resources.contentHash, hash), notInArray(resources.id, candidateIds), toJudgedResourceFilter(topicId)),
		)
		.limit(1)
	return duplicate !== undefined
}

// whether the Topic judged a Resource outside this Scan whose embedding is close enough to this one to be a duplicate.
// the distance is measured exactly, over the Topic's judged Resources alone, with no order for an index to walk
async function hasNearDuplicate(embedding: number[], { topicId, candidateIds }: StoredDedupeScope): Promise<boolean> {
	const [nearDuplicate] = await db
		.select({ id: resources.id })
		.from(resources)
		.where(
			and(
				toJudgedResourceFilter(topicId),
				notInArray(resources.id, candidateIds),
				isNotNull(resources.embedding),
				lt(cosineDistance(resources.embedding, embedding), NEAR_DUPLICATE_DISTANCE),
			),
		)
		.limit(1)
	return nearDuplicate !== undefined
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
	// a personal link whose title was read off its url has no text of its own
	if (
		resource.personalSourceScoreBonus &&
		!resource.snippet?.trim() &&
		resource.title === toFallbackTitle(resource.url, null)
	) {
		return false
	}

	// any other Resource has text if it has a title or a snippet
	return Boolean(resource.title?.trim() || resource.snippet?.trim())
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
	return toOneLineText(text.toLowerCase())
}

/**
 * Whether a cosine distance is close enough to mark a near-duplicate resource.
 */
export function isNearDuplicate(distance: number): boolean {
	return distance < NEAR_DUPLICATE_DISTANCE
}

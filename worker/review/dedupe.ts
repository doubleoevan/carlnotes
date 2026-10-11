// the dedupe pass over the relevant Resources: a content hash catches a copy and a near-duplicate embedding catches
// a rewrite, against what this Scan let through and what an earlier Scan stored
import { cosineSimilarity } from "ai"
import { and, cosineDistance, eq, isNotNull, lt, notInArray } from "drizzle-orm"
import { db } from "../../db"
import { resources } from "../../db/schema/scans"
import type { RelevantResource, Resource } from "./filter"
import { type ResourceOutcome, type ReviewOutcome, trackOutcomes } from "./track"

// how close two embeddings must be for the later Resource to count as a duplicate of the earlier one
const NEAR_DUPLICATE_DISTANCE = 0.05

// the content hashes and embeddings this Scan dedupes each new Resource against
export type DedupeKeys = { contentHashes: Set<string>; embeddings: number[][] }

// the Resources the dedupe walks in ranked order, the Scan's candidates, its running totals, and the url Sources'
// own pages, which it passes through
type DedupeResourcesOptions = {
	relevantResources: RelevantResource[]
	candidateIds: string[]
	reviewOutcome: ReviewOutcome
	urlSourcePageIds: Set<string>
}

/**
 * Drop the relevant Resources that duplicate one this Scan already let through, returning the rest in ranked order.
 * This walk stays sequential, so the highest-ranked member of a duplicate set is the one that wins the slot.
 * A url Source's own page is never dropped.
 */
export async function dedupeResources({
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

// run one relevant Resource through both dedupe stages, returning a filtered outcome or null when it is no duplicate
async function dedupeResource(
	relevantResource: RelevantResource,
	candidateIds: string[],
	dedupeKeys: DedupeKeys,
): Promise<ResourceOutcome | null> {
	const { resource, embedding } = relevantResource
	// the content hash over the native text, only when the Resource has content. empty rows must not collapse to one hash
	const contentHash = hasNativeText(resource) ? toContentHash(resource.title, resource.snippet) : null

	// stage 1 checks for a content-level duplicate, of a candidate this Scan let through or of a Resource an earlier
	if (contentHash !== null) {
		const isHashDuplicate =
			dedupeKeys.contentHashes.has(contentHash) || (await hasStoredHash(contentHash, candidateIds))
		if (isHashDuplicate) {
			return { status: "filtered", reason: "duplicate content" }
		}
	}

	// stage 2 checks for a near-duplicate, of a candidate this Scan let through or of a Resource an earlier Scan stored
	if (hasNearDuplicateKey(dedupeKeys, embedding) || (await hasNearDuplicate(embedding, candidateIds))) {
		return { status: "filtered", reason: "near-duplicate" }
	}

	// no duplicate. persist the hash for later Scans and remember both keys so a lower-ranked candidate dedupes against this one
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

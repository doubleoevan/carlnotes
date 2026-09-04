// filter tests for the hashing, threshold, ranking, and dedupe decisions the free stages make
import { expect, test } from "bun:test"
import {
	hasNearDuplicateKey,
	isNearDuplicate,
	isRelevant,
	normalizeText,
	rankBySimilarity,
	toContentHash,
} from "./filter"

// a stand-in Resource for the ranking and dedupe test cases, which read only its id
function toTestResource(id: string): Parameters<typeof rankBySimilarity>[0][number]["resource"] {
	return { id } as Parameters<typeof rankBySimilarity>[0][number]["resource"]
}

// normalizeText lowercases and collapses whitespace, so that formatting noise doesn't change the hash
test("normalizeText lowercases and collapses whitespace", () => {
	expect(normalizeText("  Hello   World\n")).toBe("hello world")
})

// contentHash is stable across whitespace and case. only the same content hashes alike
test("contentHash normalizes before hashing and differs for different content", () => {
	// the same content formatted differently hashes alike
	expect(toContentHash("Hello", "World")).toBe(toContentHash("hello", "  world "))
	// different content hashes differently
	expect(toContentHash("Hello", "World")).not.toBe(toContentHash("Hello", "Mars"))
})

// the two gate predicates fire on the right side of their thresholds
test("threshold predicates gate on the right side of the boundary", () => {
	// a small cosine distance is a near-duplicate
	expect(isNearDuplicate(0.01)).toBe(true)
	expect(isNearDuplicate(0.5)).toBe(false)

	// a high similarity clears the relevance gate, measured as an article
	expect(isRelevant(0.9, "read")).toBe(true)
	expect(isRelevant(0.1, "read")).toBe(false)
})

// a video's title and channel description embed further from a topic than an article's query-matched extract
test("the relevance gate measures each kind against its own bar", () => {
	// a middling similarity clears the gate for a video and misses it for an article
	expect(isRelevant(0.3, "watch")).toBe(true)
	expect(isRelevant(0.3, "listen")).toBe(true)
	expect(isRelevant(0.3, "read")).toBe(false)

	// every kind still has a floor, so an unrelated video is dropped like anything else
	expect(isRelevant(0.1, "watch")).toBe(false)
})

// ranking orders the relevant Resources best-first
test("rankBySimilarity orders relevant resources best-first and the limit takes the top N", () => {
	// three relevant resources in the arbitrary order the database returned them
	const relevantResources = [
		{ resource: toTestResource("low"), embedding: [1, 0], similarity: 0.36 },
		{ resource: toTestResource("high"), embedding: [0, 1], similarity: 0.98 },
		{ resource: toTestResource("mid"), embedding: [1, 1], similarity: 0.72 },
	]

	// ranked best-first, so truncating to a limit of one keeps the 0.98 instead of the 0.36 that came back first
	const ranked = rankBySimilarity(relevantResources)
	expect(ranked.map((relevantResource) => relevantResource.similarity)).toEqual([0.98, 0.72, 0.36])
	expect(ranked.slice(0, 1).map((relevantResource) => relevantResource.resource.id)).toEqual(["high"])
})

// two near-identical resources in one Scan must leave exactly one of them, never both dropped
test("hasNearDuplicateKey drops a sibling of a resource already let through, leaving one", () => {
	// no keys recorded yet, so the first resource is not a duplicate of anything
	const dedupeKeys = { contentHashes: new Set<string>(), embeddings: [] as number[][] }
	const firstEmbedding = [1, 0, 0]
	expect(hasNearDuplicateKey(dedupeKeys, firstEmbedding)).toBe(false)

	// record the first resource's keys, the way the ranked pass does once it clears both dedupe stages
	dedupeKeys.contentHashes.add("hash-a")
	dedupeKeys.embeddings.push(firstEmbedding)

	// a near-identical sibling now dedupes against the recorded one instead of being filtered with it
	expect(hasNearDuplicateKey(dedupeKeys, [0.9999, 0.0001, 0])).toBe(true)
	// a genuinely distinct resource still passes
	expect(hasNearDuplicateKey(dedupeKeys, [0, 1, 0])).toBe(false)
})

// two resources sharing a content hash in one Scan also leave exactly one of them
test("a recorded content hash drops a later sibling sharing it", () => {
	// the first resource clears dedupe, recording its hash the way the ranked pass does
	const dedupeKeys = { contentHashes: new Set<string>(), embeddings: [] as number[][] }
	expect(dedupeKeys.contentHashes.has("hash-a")).toBe(false)
	dedupeKeys.contentHashes.add("hash-a")

	// a later resource with the same hash is caught, and a different hash is not
	expect(dedupeKeys.contentHashes.has("hash-a")).toBe(true)
	expect(dedupeKeys.contentHashes.has("hash-b")).toBe(false)
})

// because the pass is ranked, the member of a duplicate set that wins its slot is the one with the highest
test("the surviving member of a near-duplicate set is the higher-scoring one", () => {
	// two near-identical resources that reach the ranked pass out of order
	const relevantResources = [
		{ resource: toTestResource("weaker"), embedding: [0.9999, 0.0001, 0], similarity: 0.4 },
		{ resource: toTestResource("stronger"), embedding: [1, 0, 0], similarity: 0.9 },
	]

	// walk them in rank order the way the ranked pass does, keeping the first resource of each duplicate set
	const dedupeKeys = { contentHashes: new Set<string>(), embeddings: [] as number[][] }
	const dedupedIds: string[] = []
	for (const relevantResource of rankBySimilarity(relevantResources)) {
		if (hasNearDuplicateKey(dedupeKeys, relevantResource.embedding)) {
			continue
		}

		// record its keys, so the next resource dedupes against this one
		dedupeKeys.embeddings.push(relevantResource.embedding)
		dedupedIds.push(relevantResource.resource.id)
	}

	// exactly one survived, and it is the higher-scoring resource instead of whichever came back first
	expect(dedupedIds).toEqual(["stronger"])
})

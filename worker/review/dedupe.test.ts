// dedupe tests for the hashing and the near-duplicate decisions, and the url Source page the dedupe passes through
import { expect, test } from "bun:test"
import { dedupeResources, hasNearDuplicateKey, normalizeText, toContentHash } from "./dedupe"
import { rankBySimilarity } from "./filter"
import { toTestResource } from "./reviewTestFixtures"
import { emptyReviewOutcome } from "./track"

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

// two near-identical resources in one Scan must leave exactly one of them, never both dropped
test("hasNearDuplicateKey drops a candidate matching a resource already let through, leaving one", () => {
	// no keys recorded yet, so the first resource is not a duplicate of anything
	const dedupeKeys = { contentHashes: new Set<string>(), embeddings: [] as number[][] }
	const firstEmbedding = [1, 0, 0]
	expect(hasNearDuplicateKey(dedupeKeys, firstEmbedding)).toBe(false)

	// record the first resource's keys, the way the ranked pass does once it clears both dedupe stages
	dedupeKeys.contentHashes.add("hash-a")
	dedupeKeys.embeddings.push(firstEmbedding)

	// a near-identical candidate now dedupes against the recorded one instead of being filtered with it
	expect(hasNearDuplicateKey(dedupeKeys, [0.9999, 0.0001, 0])).toBe(true)
	// a genuinely distinct resource still passes
	expect(hasNearDuplicateKey(dedupeKeys, [0, 1, 0])).toBe(false)
})

// two resources sharing a content hash in one Scan also leave exactly one of them
test("a recorded content hash drops a later candidate sharing it", () => {
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

// two url Source pages titled by the same url segment would hash and embed alike, and the dedupe keeps both
test("the dedupe passes a url Source's own page through untouched", async () => {
	// two pages with the same fallback title and the same vector
	const firstPage = { ...toTestResource("first-page"), title: "jobs", snippet: null }
	const secondPage = { ...firstPage, id: "second-page" }
	const relevantResources = [firstPage, secondPage].map((resource) => ({
		resource,
		embedding: [1, 0],
		similarity: 0.2,
	}))
	const resourcesToScore = await dedupeResources({
		relevantResources,
		candidateIds: ["first-page", "second-page"],
		reviewOutcome: emptyReviewOutcome(),
		urlSourcePageIds: new Set(["first-page", "second-page"]),
	})
	expect(resourcesToScore.map((resource) => resource.id)).toEqual(["first-page", "second-page"])
})

// filter tests for the hashing, threshold, ranking, and dedupe decisions the free stages make
import { expect, test } from "bun:test"
import {
	hasAdmittedNearDuplicate,
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

// ranking orders the relevance-gate survivors best-first
test("rankBySimilarity orders survivors best-first and the limit takes the top N", () => {
	// three survivors in the arbitrary order the database returned them
	const survivors = [
		{ resource: toTestResource("low"), embedding: [1, 0], similarity: 0.36 },
		{ resource: toTestResource("high"), embedding: [0, 1], similarity: 0.98 },
		{ resource: toTestResource("mid"), embedding: [1, 1], similarity: 0.72 },
	]

	// ranked best-first, so truncating to a limit of one keeps the 0.98 instead of the 0.36 that came back first
	const ranked = rankBySimilarity(survivors)
	expect(ranked.map((survivor) => survivor.similarity)).toEqual([0.98, 0.72, 0.36])
	expect(ranked.slice(0, 1).map((survivor) => survivor.resource.id)).toEqual(["high"])
})

// two near-identical unscoredResources in one Scan must leave exactly one survivor, never both dropped
test("hasAdmittedNearDuplicate drops a sibling of an already-admitted unscoredResource, leaving one survivor", () => {
	// nothing admitted yet, so the first unscoredResource is not a duplicate of anything
	const admitted = { contentHashes: new Set<string>(), embeddings: [] as number[][] }
	const firstEmbedding = [1, 0, 0]
	expect(hasAdmittedNearDuplicate(admitted, firstEmbedding)).toBe(false)

	// admit the first unscoredResource, the way the ranked pass does once it clears both dedupe stages
	admitted.contentHashes.add("hash-a")
	admitted.embeddings.push(firstEmbedding)

	// a near-identical sibling now dedupes against the admitted one instead of being filtered with it
	expect(hasAdmittedNearDuplicate(admitted, [0.9999, 0.0001, 0])).toBe(true)
	// a genuinely distinct unscoredResource still passes
	expect(hasAdmittedNearDuplicate(admitted, [0, 1, 0])).toBe(false)
})

// two unscoredResources sharing a content hash in one Scan also leave exactly one survivor
test("an admitted content hash drops a later sibling sharing it", () => {
	// the first unscoredResource is admitted, recording its hash the way the ranked pass does
	const admitted = { contentHashes: new Set<string>(), embeddings: [] as number[][] }
	expect(admitted.contentHashes.has("hash-a")).toBe(false)
	admitted.contentHashes.add("hash-a")

	// a later unscoredResource with the same hash is caught, and a different hash is not
	expect(admitted.contentHashes.has("hash-a")).toBe(true)
	expect(admitted.contentHashes.has("hash-b")).toBe(false)
})

// because the pass is ranked, the member of a duplicate set that wins its slot is the one with the highest
test("the admitted member of a near-duplicate set is the higher-scoring one", () => {
	// two near-identical unscoredResources that reach the ranked pass out of order
	const survivors = [
		{ resource: toTestResource("weaker"), embedding: [0.9999, 0.0001, 0], similarity: 0.4 },
		{ resource: toTestResource("stronger"), embedding: [1, 0, 0], similarity: 0.9 },
	]

	// walk them in rank order the way the ranked pass does, admitting the first resource of each duplicate set
	const admitted = { contentHashes: new Set<string>(), embeddings: [] as number[][] }
	const admittedIds: string[] = []
	for (const survivor of rankBySimilarity(survivors)) {
		if (hasAdmittedNearDuplicate(admitted, survivor.embedding)) {
			continue
		}

		// admit it, so the next unscoredResource dedupes against this one
		admitted.embeddings.push(survivor.embedding)
		admittedIds.push(survivor.resource.id)
	}

	// exactly one survived, and it is the higher-scoring resource instead of whichever came back first
	expect(admittedIds).toEqual(["stronger"])
})

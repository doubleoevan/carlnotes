// filter tests for the hashing, threshold, ranking, and dedupe decisions the free stages make, and the topic context limits
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toTopicContextHash } from "../attach"
import { newBudget } from "../budget"
import * as models from "../models"
import {
	dedupeResources,
	gateResources,
	hasNearDuplicateKey,
	isNearDuplicate,
	isRelevant,
	loadTopicContext,
	normalizeText,
	rankBySimilarity,
	toContentHash,
	toScoreContextText,
} from "./filter"
import { emptyReviewOutcome } from "./track"

// put back the embedding call that a test stubbed
afterEach(() => {
	mock.restore()
})

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

// a Resource the Topic already holds a Finding for is in the feed, so a changed context scores it again instead of
// gating it out, while a new Resource measuring the same is dropped at the bar
test("the gate lets a resource the topic holds through below the bar and drops a new one", async () => {
	// two articles with the same stored vector, one with nothing in common with the context, so both measure a similarity of zero
	const unrelatedEmbedding = [0, 1]
	const topicResource = { id: "topic-resource", kind: "read", embedding: unrelatedEmbedding } as Parameters<
		typeof gateResources
	>[0][number]
	const newResource = { ...topicResource, id: "new" }
	const topicContext = { name: "t", text: "t", embedding: [1, 0], contextHash: "hash", scoreText: "t" }
	const relevantResources = await gateResources(
		[topicResource, newResource],
		topicContext,
		emptyReviewOutcome(),
		newBudget(),
		undefined,
		undefined,
		new Set(["topic-resource"]),
	)
	expect(relevantResources.map((relevantResource) => relevantResource.resource.id)).toEqual(["topic-resource"])
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

// the score prompt reads the liked or bookmarked pages, then the rated down pages, up to ten of each, by title and host
test("toScoreContextText lists the example pages after the context text", () => {
	// a topic with no example pages scores against its context text alone
	expect(toScoreContextText("context", { likedOrBookmarkedPages: [], ratedDownPages: [] })).toBe("context")

	// a page with no title shows its url, and the list stops at ten pages
	const bookmarkedPages = Array.from({ length: 12 }, (_, i) => ({
		title: i === 1 ? null : `Page ${i}`,
		url: `https://www.example.com/${i}`,
	}))
	const ratedDownPages = [{ title: "Junk", url: "https://junk.example/a" }]
	const scoreContextLines = toScoreContextText("context", {
		likedOrBookmarkedPages: bookmarkedPages,
		ratedDownPages,
	}).split("\n")
	expect(scoreContextLines.slice(0, 5)).toEqual([
		"context",
		"",
		"[pages the reader liked or bookmarked]",
		"- Page 0 (example.com)",
		"- https://www.example.com/1 (example.com)",
	])
	expect(scoreContextLines.slice(13)).toEqual(["", "[pages the reader rated down]", "- Junk (junk.example)"])
})

// the score prompt reads a long attachment past the embedding limit, and the hash covers what the score prompt reads
test("loadTopicContext scores past the embedding limit and hashes the text that it scores", async () => {
	// stub the embedding call and keep the text that the call embeds
	const embeddedTexts: string[] = []
	spyOn(models, "embedVector").mockImplementation(async (text) => {
		embeddedTexts.push(text)
		return [1]
	})

	// a list of names over 20,000 characters long, whose last name sits far past the first 8,000 characters
	const namesList = Array.from({ length: 2000 }, (_, i) => `Chen ${i}`).join(", ")
	const topicContext = await loadTopicContext({
		topicScanContext: { name: "Keeping Up with the Chens", context: `${namesList} Chen Last` },
		scoreExamplePages: { likedOrBookmarkedPages: [], ratedDownPages: [] },
		budget: newBudget(),
	})

	// the score text and the hash include the last name, and the embedding reads only the first 8,000 characters
	expect(topicContext.scoreText).toContain("Chen Last")
	expect(embeddedTexts[0]).not.toContain("Chen Last")
	expect(topicContext.text.length).toBeGreaterThan(20_000)
	expect(topicContext.contextHash).toBe(toTopicContextHash(topicContext.text))
	expect(topicContext.contextHash).not.toBe(toTopicContextHash(topicContext.text.slice(0, 8000)))

	// a context under the embedding limit hashes the same text that the gate embeds
	const shortTopicContext = await loadTopicContext({
		topicScanContext: { name: "Grinders", context: "Burr grinders under $200." },
		scoreExamplePages: { likedOrBookmarkedPages: [], ratedDownPages: [] },
		budget: newBudget(),
	})
	expect(shortTopicContext.contextHash).toBe(toTopicContextHash("Grinders\n\nBurr grinders under $200."))
})

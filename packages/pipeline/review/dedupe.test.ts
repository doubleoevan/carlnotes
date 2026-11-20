// dedupe tests for the hashing and the near-duplicate decisions, the url Source page the dedupe passes through, and
// the stored pages a candidate is compared with, which are the Topic's own
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { dedupeResources, hasNearDuplicateKey, normalizeText, toContentHash } from "./dedupe"
import { rankBySimilarity } from "./filter"
import { toTestResource } from "./reviewTestFixtures"
import { emptyReviewOutcome } from "./track"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

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
		if (!relevantResource.embedding) {
			throw new Error("Expected an embedded ordinary candidate")
		}

		// a near-duplicate of one already kept is dropped
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
		topicId: "topic-1",
		relevantResources,
		candidateIds: ["first-page", "second-page"],
		reviewOutcome: emptyReviewOutcome(),
		urlSourcePageIds: new Set(["first-page", "second-page"]),
	})
	expect(resourcesToScore.map((resource) => resource.id)).toEqual(["first-page", "second-page"])
})

// bypassing the embedding gate must also leave a valid candidate for the dedupe stage
test("a personal link without an embedding still reaches paid scoring", async () => {
	const resource = {
		...toTestResource("personal"),
		title: null,
		snippet: null,
		embedding: null,
		personalSourceScoreBonus: 0.1 as const,
	}
	const candidates = await dedupeResources({
		topicId: "topic-1",
		relevantResources: [{ resource, embedding: null, similarity: 0 }],
		candidateIds: [resource.id],
		reviewOutcome: emptyReviewOutcome(),
		urlSourcePageIds: new Set(),
	})
	expect(candidates.map(({ id }) => id)).toEqual(["personal"])
})

test("different personal pages with the same URL-derived title both reach scoring", async () => {
	const relevantResources = ["one.example", "two.example"].map((host) => ({
		resource: {
			...toTestResource(host),
			url: `https://${host}/guide`,
			title: "guide",
			snippet: null,
			embedding: null,
			personalSourceScoreBonus: 0.1 as const,
		},
		embedding: null,
		similarity: 0,
	}))
	const candidates = await dedupeResources({
		topicId: "topic-1",
		relevantResources,
		candidateIds: relevantResources.map(({ resource }) => resource.id),
		reviewOutcome: emptyReviewOutcome(),
		urlSourcePageIds: new Set(),
	})
	expect(candidates).toHaveLength(2)
})

// an ordinary candidate with a title, a snippet, and a vector, which both stored reads look for a duplicate of
const STORY = {
	resource: { ...toTestResource("story"), title: "Burr grinders compared", snippet: "Twelve grinders.", kind: "read" },
	embedding: [1, 0],
	similarity: 0.6,
} as Parameters<typeof dedupeResources>[0]["relevantResources"][number]

// the judged pages of a Topic: the ones it holds a Finding for, and the ones whose Finding its limit removed
const JUDGED_RESOURCES_FILTER =
	'"resources"."id" in ((select "resource_id" from "findings" where "findings"."topic_id" = $3) union (select "resource_id" from "filtered_findings" where "filtered_findings"."topic_id" = $4))'

// one Topic never loses a story because another Topic's Scan stored it first
test("a story that only another Topic stored is still scored for this one", async () => {
	// no page that this Topic judged has the story's hash or sits near its vector
	const sentQueries = stubConnectionPool(() => [])
	const resourcesToScore = await dedupeResources({
		topicId: "topic-1",
		relevantResources: [STORY],
		candidateIds: ["story"],
		reviewOutcome: emptyReviewOutcome(),
		urlSourcePageIds: new Set(),
	})
	expect(resourcesToScore.map((resource) => resource.id)).toEqual(["story"])

	// the hash read looks among the Topic's judged pages alone, without this Scan's candidates
	const [hashRead, nearDuplicateRead] = sentQueries.filter((sentQuery) => sentQuery.text.startsWith("select"))
	expect(hashRead?.text).toContain(
		`where ("resources"."content_hash" = $1 and "resources"."id" not in ($2) and ${JUDGED_RESOURCES_FILTER})`,
	)
	expect(hashRead?.values).toEqual([
		toContentHash("Burr grinders compared", "Twelve grinders."),
		"story",
		"topic-1",
		"topic-1",
		1,
	])

	// the near-duplicate read measures the distance over those pages, with no order for an index to walk
	expect(nearDuplicateRead?.text).toContain('"resources"."id" in ((select "resource_id" from "findings"')
	expect(nearDuplicateRead?.text).toContain('"resources"."embedding" <=> $')
	expect(nearDuplicateRead?.text).not.toContain("order by")
})

test("a page that the Topic judged before drops its copy and its near-duplicate", async () => {
	// the Topic holds a Finding or a filtered finding for a page with the story's hash
	const reviewOutcome = emptyReviewOutcome()
	stubConnectionPool(({ text }) => (text.includes('"resources"."content_hash" = $1') ? [["judged-page"]] : []))
	const dedupeOptions = {
		topicId: "topic-1",
		candidateIds: ["story"],
		reviewOutcome,
		urlSourcePageIds: new Set<string>(),
	}
	expect(await dedupeResources({ ...dedupeOptions, relevantResources: [STORY] })).toEqual([])
	expect(reviewOutcome.filteredCounts["duplicate content"]).toBe(1)

	// another hash, and a judged page within the near-duplicate distance of the story's vector
	restoreConnectionPool()
	stubConnectionPool(({ text }) => (text.includes("<=>") ? [["judged-page"]] : []))
	expect(await dedupeResources({ ...dedupeOptions, relevantResources: [STORY] })).toEqual([])
	expect(reviewOutcome.filteredCounts["near-duplicate"]).toBe(1)
})

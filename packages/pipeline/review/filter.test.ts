// filter tests for the threshold, ranking, and gate decisions the free stages make, and the topic context limits
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { newBudget } from "@carlnotes/models/budget"
import * as models from "@carlnotes/models/models"
import { APICallError } from "ai"
import { toTopicContextHash } from "../attach"
import { isNearDuplicate } from "./dedupe"
import { gateResources, isRelevant, rankBySimilarity } from "./filter"
import { toTestResource } from "./reviewTestFixtures"
import { loadTopicContext, toScoreContextText } from "./topicContext"
import { emptyReviewOutcome } from "./track"

// put back the embedding call that a test stubbed, and the connection pool
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
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

// the score prompt reads the liked or bookmarked pages, then the rated down pages, up to ten of each, by title and host
test("toScoreContextText lists the example pages after the context text", () => {
	// a topic with no example pages scores against its context text alone
	expect(toScoreContextText("context", { likedOrBookmarkedPages: [], ratedDownPages: [] })).toBe("context")

	// the shared comments come last, one line each, a comment with no author as Carl's
	const sharedContextText = toScoreContextText("context", { likedOrBookmarkedPages: [], ratedDownPages: [] }, [
		{ username: "roastfan", body: "Worth a\nlisten." },
		{ username: null, body: "Three of you bookmarked this one." },
	])
	expect(sharedContextText).toBe(
		"context\n\n[what people said about this topic, shared by its editors]\n- roastfan: Worth a listen.\n- Carl: Three of you bookmarked this one.",
	)

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

// a queued link has already passed Topic matching and needs no global embedding to reach scoring
test("personal links skip embedding work and the similarity floor, including missing vectors", async () => {
	const embed = spyOn(models, "embedVectors").mockRejectedValue(new Error("Embedding must not run"))
	const considered = mock(async () => {})
	const resources = [
		{ id: "direct", embedding: null, personalSourceScoreBonus: 0.1, kind: "read" },
		{ id: "newsletter", embedding: [0, 1], personalSourceScoreBonus: 0.05, kind: "read" },
		{ id: "ordinary", embedding: [0, 1], kind: "read" },
	] as Parameters<typeof gateResources>[0]
	const outcome = { ...emptyReviewOutcome(), onResourceConsidered: considered }
	const relevant = await gateResources(
		resources,
		{ embedding: [1, 0] } as Parameters<typeof gateResources>[1],
		outcome,
		newBudget(),
	)
	expect(relevant.map(({ resource }) => resource.id)).toEqual(["direct", "newsletter"])
	expect(embed).not.toHaveBeenCalled()
	expect(considered).toHaveBeenCalledTimes(1)
	expect(outcome.filteredCounts["below relevance threshold"]).toBe(1)
})

// two candidates with no stored vector, and an embedding failure as LiteLLM returns it
const unembeddedResources = ["first", "second"].map((id) => ({
	id,
	url: `https://example.com/${id}`,
	title: id,
	snippet: "a page",
	embedding: null,
	kind: "read",
})) as Parameters<typeof gateResources>[0]
function toEmbeddingFailure(statusCode: number, responseBody: string): APICallError {
	return new APICallError({
		message: `status ${statusCode}`,
		url: "http://litellm.test/v1/embeddings",
		requestBodyValues: {},
		statusCode,
		responseBody,
	})
}

// gates the two candidates against a matching context with instant waits, and returns the embedding writes it sent
async function gateUnembeddedResources(
	reviewOutcome = emptyReviewOutcome(),
): Promise<{ relevantIds: string[]; embeddingWriteCount: number }> {
	// the waits resolve at once, the logs stay quiet, and the embedding writes are counted
	spyOn(Bun, "sleep").mockResolvedValue(undefined)
	spyOn(console, "warn").mockImplementation(() => {})
	spyOn(console, "error").mockImplementation(() => {})
	const sentQueries = stubConnectionPool(() => [])

	// gate both against a context they match
	const topicContext = { embedding: [1, 0] } as Parameters<typeof gateResources>[1]
	const relevantResources = await gateResources(unembeddedResources, topicContext, reviewOutcome, newBudget())
	return {
		relevantIds: relevantResources.map(({ resource }) => resource.id),
		embeddingWriteCount: sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "resources"')).length,
	}
}

test("an embedding 503 followed by a success stores every vector in the batch", async () => {
	// a 503, then a vector for each candidate
	const embedSpy = spyOn(models, "embedVectors")
		.mockRejectedValueOnce(toEmbeddingFailure(503, '{"error":{"message":"overloaded"}}'))
		.mockResolvedValue([
			[1, 0],
			[1, 0],
		])
	const gateResult = await gateUnembeddedResources()
	expect(embedSpy).toHaveBeenCalledTimes(2)
	expect(gateResult).toEqual({ relevantIds: ["first", "second"], embeddingWriteCount: 2 })
})

test("a spent budget fails the embedding batch after one attempt", async () => {
	// LiteLLM names the spent budget in a 429's body
	const embedSpy = spyOn(models, "embedVectors").mockRejectedValue(
		toEmbeddingFailure(429, '{"error":{"type":"budget_exceeded"}}'),
	)
	const reviewOutcome = emptyReviewOutcome()
	const gateResult = await gateUnembeddedResources(reviewOutcome)
	expect(embedSpy).toHaveBeenCalledTimes(1)
	expect(gateResult).toEqual({ relevantIds: [], embeddingWriteCount: 0 })
	expect(reviewOutcome.failedCount).toBe(2)
})

// relatedness tests: the centroid comes from Redis or one bounded average and is stored only if it exists, a process
// ranks with the centroid in its own memory for an hour, with Redis unreachable too, and the score takes the centroid
// out of both vectors and takes a bonus off for each shared tag, compared without case or punctuation, up to two
import { afterEach, beforeEach, expect, mock, setSystemTime, spyOn, test } from "bun:test"
import { NO_SCRIPT_ROW_LIMIT } from "@carlnotes/contracts/seo"
import { HOUR_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import { EMBED_MODEL_NAME } from "@carlnotes/db/schema/scans"
import { sql } from "drizzle-orm"
import {
	clearMemoryEmbeddingCentroid,
	EMBEDDING_CENTROID_KEY,
	loadEmbeddingCentroid,
	loadRelatedIds,
	toMergedRelatedIds,
	toRelatedScore,
} from "./relatedness"
import { EMBEDDING_CENTROID } from "./relatednessTestFixtures"

// one Redis and no centroid in memory per test
let storedValueByKey: Map<string, string>
beforeEach(() => {
	clearMemoryEmbeddingCentroid()
	storedValueByKey = stubRedisClient()
})

// the centroid in memory, the clock, the spies, the connection pool's own query, and Redis put back after each test
afterEach(() => {
	clearMemoryEmbeddingCentroid()
	setSystemTime()
	mock.restore()
	restoreConnectionPool()
	restoreRedisClient()
})

// whether a query is the centroid's average
function isEmbeddingCentroidQuery({ text }: SentQuery): boolean {
	return text.includes('select avg("embedding") from (select "embedding" from "resources"')
}

// stub the pool to compute the centroid given and to return no rows for every other read, and return each query sent
function stubComputedCentroid(embeddingCentroid: number[]): SentQuery[] {
	return stubConnectionPool((sentQuery) =>
		isEmbeddingCentroidQuery(sentQuery) ? [[JSON.stringify(embeddingCentroid)]] : [],
	)
}

test("a stored centroid sends no query", async () => {
	storedValueByKey.set(EMBEDDING_CENTROID_KEY, JSON.stringify(EMBEDDING_CENTROID))
	const sentQueries = stubConnectionPool()
	expect(await loadEmbeddingCentroid()).toEqual(EMBEDDING_CENTROID)
	expect(sentQueries).toHaveLength(0)
})

test("a missing centroid averages a bounded sample of the current model's embeddings and stores it", async () => {
	const sentQueries = stubConnectionPool(() => [[JSON.stringify(EMBEDDING_CENTROID)]])
	expect(await loadEmbeddingCentroid()).toEqual(EMBEDDING_CENTROID)

	// one average over a limited sample of the current model's resource embeddings
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toContain('select avg("embedding") from (select "embedding" from "resources"')
	expect(sentQueries[0]?.text).toContain('limit $2) "sampled_embeddings"')
	expect(sentQueries[0]?.values).toEqual([EMBED_MODEL_NAME, 20_000])
	expect(storedValueByKey.get(EMBEDDING_CENTROID_KEY)).toBe(JSON.stringify(EMBEDDING_CENTROID))
})

test("a database with no embedded resource has no centroid, stores nothing, and computes again on the next load", async () => {
	const sentQueries = stubConnectionPool(() => [[null]])
	expect(await loadEmbeddingCentroid()).toBeNull()
	expect(storedValueByKey.has(EMBEDDING_CENTROID_KEY)).toBe(false)

	// no centroid is held in memory either, so the next load averages again
	expect(await loadEmbeddingCentroid()).toBeNull()
	expect(sentQueries.filter(isEmbeddingCentroidQuery)).toHaveLength(2)
})

test("a second related read with Redis unreachable sends no centroid query and ranks with the first read's", async () => {
	// Redis down from the start, with the failed connection's log quiet, and a public ranking that records its centroid
	stubUnreachableRedisClient()
	spyOn(console, "error").mockImplementation(() => {})
	const sentQueries = stubComputedCentroid(EMBEDDING_CENTROID)
	const rankedCentroids: number[][] = []
	const loadPageRelatedIds = (): Promise<string[]> =>
		loadRelatedIds({
			cacheKey: "related-topics:topic-1",
			toPublicRelatedScoresQuery: async (_transaction, embeddingCentroid) => {
				rankedCentroids.push(embeddingCentroid)
				return [{ id: "topic-2", relatedScore: 0.2 }]
			},
		})

	// the first read computes the centroid once, and the second ranks with the same one and computes nothing
	expect(await loadPageRelatedIds()).toEqual(["topic-2"])
	expect(await loadPageRelatedIds()).toEqual(["topic-2"])
	expect(sentQueries.filter(isEmbeddingCentroidQuery)).toHaveLength(1)
	expect(rankedCentroids).toEqual([EMBEDDING_CENTROID, EMBEDDING_CENTROID])
})

test("a process that read the centroid from Redis ranks with it once Redis is unreachable", async () => {
	// one load while Redis holds the centroid
	storedValueByKey.set(EMBEDDING_CENTROID_KEY, JSON.stringify(EMBEDDING_CENTROID))
	const sentQueries = stubConnectionPool()
	expect(await loadEmbeddingCentroid()).toEqual(EMBEDDING_CENTROID)

	// Redis goes down, and the next load returns the same centroid with no query
	stubUnreachableRedisClient()
	expect(await loadEmbeddingCentroid()).toEqual(EMBEDDING_CENTROID)
	expect(sentQueries).toHaveLength(0)
})

test("the centroid in memory lasts an hour, then the next load reads Redis, or computes if Redis has none", async () => {
	// a load at noon reads the centroid Redis holds
	const loadedAt = new Date("2026-11-13T12:00:00Z").getTime()
	setSystemTime(new Date(loadedAt))
	storedValueByKey.set(EMBEDDING_CENTROID_KEY, JSON.stringify(EMBEDDING_CENTROID))
	const sentQueries = stubComputedCentroid([0.75, 0.5])
	expect(await loadEmbeddingCentroid()).toEqual(EMBEDDING_CENTROID)

	// Redis gets a newer centroid, which a load a millisecond inside the hour does not read
	const newerEmbeddingCentroid = [0.125, 0.875]
	storedValueByKey.set(EMBEDDING_CENTROID_KEY, JSON.stringify(newerEmbeddingCentroid))
	setSystemTime(new Date(loadedAt + HOUR_MS - 1))
	expect(await loadEmbeddingCentroid()).toEqual(EMBEDDING_CENTROID)

	// at the hour the next load reads Redis again
	setSystemTime(new Date(loadedAt + HOUR_MS))
	expect(await loadEmbeddingCentroid()).toEqual(newerEmbeddingCentroid)
	expect(sentQueries).toHaveLength(0)

	// an hour later Redis has none, so the load computes the centroid and stores it
	storedValueByKey.delete(EMBEDDING_CENTROID_KEY)
	setSystemTime(new Date(loadedAt + 2 * HOUR_MS))
	expect(await loadEmbeddingCentroid()).toEqual([0.75, 0.5])
	expect(sentQueries.filter(isEmbeddingCentroidQuery)).toHaveLength(1)
	expect(storedValueByKey.get(EMBEDDING_CENTROID_KEY)).toBe(JSON.stringify([0.75, 0.5]))
})

test("the score takes the centroid out of both vectors and a bonus off for up to two shared tags", () => {
	// a score over two vector and two tag expressions
	const relatedScore = toRelatedScore({
		candidateEmbedding: sql`candidate.embedding`,
		pageEmbedding: sql`page.embedding`,
		embeddingCentroid: EMBEDDING_CENTROID,
		candidateTags: sql`candidate.tags`,
		pageTopicId: "topic-1",
	})
	const { sql: scoreText, params } = db.select({ relatedScore }).from(sql`candidate`).toSQL()

	// the cosine distance with the centroid taken out of both vectors
	expect(scoreText).toContain("((candidate.embedding - $1::vector) <=> (page.embedding - $2::vector))")
	expect(params.slice(0, 2)).toEqual([JSON.stringify(EMBEDDING_CENTROID), JSON.stringify(EMBEDDING_CENTROID)])

	// the shared tags compared lowercased with everything but letters and digits left out, an empty key never matching
	expect(scoreText).toContain("count(distinct regexp_replace(lower(tag), '[^[:alnum:]]', '', 'g'))")
	expect(scoreText).toContain("regexp_replace(lower(tag), '[^[:alnum:]]', '', 'g') <> ''")
	expect(scoreText).toContain(
		'from unnest((select "topics"."tags" from "topics" where "topics"."id" = $4)) as page_tag',
	)

	// a tenth off for each shared tag, counting two at most
	expect(scoreText).toContain("$3::float8 * least(")
	expect(params.slice(2)).toEqual([0.1, "topic-1", 2])
})

test("the merge keeps each id once at its lowest score, most related first, up to fifty", () => {
	// a public row and an accessible row for the same topic, and more rows than a page lists
	const relatedScoreRows = [
		{ id: "topic-2", relatedScore: 0.5 },
		{ id: "topic-3", relatedScore: 0.2 },
		{ id: "topic-2", relatedScore: 0.4 },
		...Array.from({ length: 60 }, (_, i) => ({ id: `topic-far-${i}`, relatedScore: 0.6 + i / 1000 })),
	]
	const mergedRelatedIds = toMergedRelatedIds(relatedScoreRows)

	// the shared topic once, the most related first, and fifty in all
	expect(mergedRelatedIds.slice(0, 3)).toEqual(["topic-3", "topic-2", "topic-far-0"])
	expect(mergedRelatedIds.filter((relatedId) => relatedId === "topic-2")).toHaveLength(1)
	expect(mergedRelatedIds).toHaveLength(NO_SCRIPT_ROW_LIMIT)
})

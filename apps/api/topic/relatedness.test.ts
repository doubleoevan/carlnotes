// relatedness tests: the centroid comes from Redis or one bounded average and is stored only if it exists, and the
// score takes the centroid out of both vectors and takes a bonus off for each shared tag, compared without case or
// punctuation, up to two
import { afterEach, beforeEach, expect, test } from "bun:test"
import { NO_SCRIPT_ROW_LIMIT } from "@carlnotes/contracts/seo"
import { db } from "@carlnotes/db"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { EMBED_MODEL_NAME } from "@carlnotes/db/schema/scans"
import { sql } from "drizzle-orm"
import { EMBEDDING_CENTROID_KEY, loadEmbeddingCentroid, toMergedRelatedIds, toRelatedScore } from "./relatedness"
import { EMBEDDING_CENTROID } from "./relatednessTestFixtures"

// one Redis per test, and the connection pool's own query and Redis put back after each test
let storedValueByKey: Map<string, string>
beforeEach(() => {
	storedValueByKey = stubRedisClient()
})
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

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

test("a database with no embedded resource has no centroid and stores nothing", async () => {
	stubConnectionPool(() => [[null]])
	expect(await loadEmbeddingCentroid()).toBeNull()
	expect(storedValueByKey.has(EMBEDDING_CENTROID_KEY)).toBe(false)
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

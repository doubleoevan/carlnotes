// the related reads' test fixtures: the centroid that the reads take out of every vector, stored in the Redis stub
import { afterEach, beforeEach, onTestFinished } from "bun:test"
import { restoreConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { clearMemoryEmbeddingCentroid, EMBEDDING_CENTROID_KEY } from "./relatedness"

// the average resource embedding that the related reads take out of every vector
export const EMBEDDING_CENTROID = [0.5, 0.25]

/**
 * Stubs Redis with the centroid already stored, so a related read ranks with no centroid read. The centroid in this
 * process's memory is forgotten first, and again once the test that called this ends.
 */
export function stubRedisClientWithCentroid(): void {
	// a test reads the stored centroid, and leaves none in memory for the tests after it
	clearMemoryEmbeddingCentroid()
	onTestFinished(clearMemoryEmbeddingCentroid)
	stubRedisClient().set(EMBEDDING_CENTROID_KEY, JSON.stringify(EMBEDDING_CENTROID))
}

/**
 * Stubs Redis with the centroid before each test, and puts the connection pool and Redis back after each.
 */
export function stubRelatedReadsForEachTest(): void {
	// a Redis stub with the centroid before each test
	beforeEach(() => {
		stubRedisClientWithCentroid()
	})

	// the connection pool and Redis put back after each test
	afterEach(() => {
		restoreConnectionPool()
		restoreRedisClient()
	})
}

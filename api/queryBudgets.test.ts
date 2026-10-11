// query budgets for the cached routes: each route is requested twice against the pool and Redis stubs, and the
// cache hit request's query count stays at or under the route's maximum
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import {
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toTableRow,
} from "../db/connectionPoolStub"
import * as redis from "../db/redis"
import { restoreRedisClient } from "../db/redisClientStub"
import { runWithRequestMemo } from "../db/requestMemo"
import { topics } from "../db/schema/topics"
import { apiRoute } from "./api"
import { auth } from "./auth"
import { stubRedisClientWithCentroid } from "./topic/relatednessTestFixtures"

// the most queries a request may send: a Redis hit serves the mention count, the topic poll, and the feed's topic
// section ids without their reads, and one topic page load reads its user's access row once and their topic role once.
// the topic page's related topics read sends its iterative index scan setting, its read, and the check of its ranked
// topics
const MAX_MENTION_COUNT_CACHE_HIT_QUERIES = 0
const MAX_TOPIC_POLL_CACHE_HIT_QUERIES = 0
const MAX_TOPIC_FEED_CACHE_HIT_QUERIES = 8
const MAX_TOPIC_PAGE_QUERIES = 20

// a public topic owned by someone else
const TOPIC_ROW = toTableRow(topics, {
	id: "topic-1",
	ownerId: "owner-1",
	name: "Agents",
	prompt: "agents",
	frequency: "daily",
	scheduledTime: "09:00:00",
	scheduledDayOfWeek: "monday",
	visibility: "public",
	tags: [],
	maxTopicFindings: 10,
	subscriberCount: 3,
	isPodcastEnabled: true,
	createdAt: new Date("2026-10-01T00:00:00Z"),
	updatedAt: new Date("2026-10-01T00:00:00Z"),
})

// the queries the stubbed pool was sent, from the start of the test
let sentQueries: SentQuery[] = []

// answer the topic's own read with the topic, a user's access read with a free user, and every other read with no rows
function toBudgetQueryRows(sentQuery: SentQuery): unknown[] {
	// the topic's own read
	if (sentQuery.text.includes('from "topics" where "topics"."id" = $1')) {
		return [TOPIC_ROW]
	}

	// the user's access read, and every other read
	if (sentQuery.text.includes('"budget_override_cents" from "users"')) {
		return [FREE_USER_ACCESS_ROW]
	}
	return []
}

// one Redis with the related reads' centroid stored and one stubbed pool per test, with the console quiet
beforeEach(() => {
	stubRedisClientWithCentroid()
	sentQueries = stubConnectionPool(toBudgetQueryRows)
	spyOn(console, "error").mockImplementation(() => {})
})

// everything back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// request a path through the api tree as the given user, with the request memo open as the server opens it,
// and return the response with how many queries the request sent
async function requestAsUser(path: string, userId: string | null): Promise<{ response: Response; queryCount: number }> {
	spyOn(auth.api, "getSession").mockResolvedValue(userId ? ({ user: { id: userId } } as never) : null)
	const queryCountBefore = sentQueries.length
	const response = await runWithRequestMemo(() => apiRoute.request(path))
	return { response, queryCount: sentQueries.length - queryCountBefore }
}

// the mention count is one read on a miss and none on a hit
test("the mention count's cache hit request stays inside its maximum", async () => {
	const cacheMissRequest = await requestAsUser("/api/rooms/mention-count", "user-1")
	const cacheHitRequest = await requestAsUser("/api/rooms/mention-count", "user-1")
	expect(cacheMissRequest.response.status).toBe(200)
	expect(cacheMissRequest.queryCount).toBeGreaterThan(MAX_MENTION_COUNT_CACHE_HIT_QUERIES)
	expect(cacheHitRequest.queryCount).toBeLessThanOrEqual(MAX_MENTION_COUNT_CACHE_HIT_QUERIES)
})

// a topic poll reads the page on a miss and nothing on a hit
test("the topic poll's cache hit request stays inside its maximum", async () => {
	const cacheMissRequest = await requestAsUser("/api/topics/topic-1?poll=1", null)
	const cacheHitRequest = await requestAsUser("/api/topics/topic-1?poll=1", null)
	expect(cacheMissRequest.response.status).toBe(200)
	expect(cacheMissRequest.queryCount).toBeGreaterThan(MAX_TOPIC_POLL_CACHE_HIT_QUERIES)
	expect(cacheHitRequest.queryCount).toBeLessThanOrEqual(MAX_TOPIC_POLL_CACHE_HIT_QUERIES)
})

// a visitor's feed reads its section order on a miss, and on a hit reads only the sections' topics and their data
test("the visitor feed's cache hit request stays inside its maximum", async () => {
	const cacheMissRequest = await requestAsUser("/api/topic-feed", null)
	const cacheHitRequest = await requestAsUser("/api/topic-feed", null)
	expect(cacheMissRequest.response.status).toBe(200)
	expect(cacheMissRequest.queryCount).toBeGreaterThan(cacheHitRequest.queryCount)
	expect(cacheHitRequest.queryCount).toBeLessThanOrEqual(MAX_TOPIC_FEED_CACHE_HIT_QUERIES)
})

// a signed-in topic page reads the user's access row once and their topic role once, however many checks it makes
test("the topic page reads the user's access and topic role once", async () => {
	// one signed-in page load inside its maximum
	const { response, queryCount } = await requestAsUser("/api/topics/topic-1", "user-1")
	expect(response.status).toBe(200)
	expect(queryCount).toBeLessThanOrEqual(MAX_TOPIC_PAGE_QUERIES)

	// one access read of this user and one role read among its queries. the owner's access is a separate row
	const accessReads = sentQueries.filter(
		(sentQuery) =>
			sentQuery.text.includes('"budget_override_cents" from "users"') && sentQuery.values.includes("user-1"),
	)
	const roleReads = sentQueries.filter((sentQuery) => sentQuery.text.includes('"role" from "team_members"'))
	expect(accessReads).toHaveLength(1)
	expect(roleReads).toHaveLength(1)
})

// a poll reload leaves out the related topics read, which a full page load sends
test("a poll reload skips the related topics read", async () => {
	// the read that only a full page load sends: the related topic ids
	const isRelatedTopicsRead = (sentQuery: SentQuery): boolean => sentQuery.text.includes('from "topic_vectors"')

	// a full load sends it, and a poll does not
	await requestAsUser("/api/topics/topic-1", "user-1")
	const fullLoadQueryCount = sentQueries.length
	expect(sentQueries.filter(isRelatedTopicsRead).length).toBeGreaterThanOrEqual(1)
	await requestAsUser("/api/topics/topic-1?poll=1", "user-1")
	expect(sentQueries.slice(fullLoadQueryCount).filter(isRelatedTopicsRead)).toHaveLength(0)
})

// a cached read that is bypassed sends its queries again, which the maximum catches
test("a bypassed cache fails the mention count's maximum", async () => {
	// a cache that always loads, and two requests
	spyOn(redis, "cacheJson").mockImplementation(({ load }) => load())
	await requestAsUser("/api/rooms/mention-count", "user-1")
	const secondRequest = await requestAsUser("/api/rooms/mention-count", "user-1")

	// the second request sent the read again
	expect(secondRequest.queryCount).toBeGreaterThan(MAX_MENTION_COUNT_CACHE_HIT_QUERIES)
})

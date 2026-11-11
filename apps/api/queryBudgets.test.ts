// query budgets for the cached routes: each route is requested twice against the pool and Redis stubs, and the
// cache hit request's query count stays at or under the route's maximum
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import {
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import * as redis from "@carlnotes/db/redis"
import { restoreRedisClient } from "@carlnotes/db/redisClientStub"
import { runWithRequestMemo } from "@carlnotes/db/requestMemo"
import { topics } from "@carlnotes/db/schema/topics"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { apiRoute } from "./api"
import { toPublishedPodcastEpisodeRow } from "./podcast/podcastEpisodeTestFixtures"
import { signInAs } from "./testSession"
import { stubRedisClientWithCentroid } from "./topic/relatednessTestFixtures"

// the most queries a request may send: a Redis hit serves the mention count, the topic poll, and the feed's topic
// section ids without their reads
const MAX_MENTION_COUNT_CACHE_HIT_QUERIES = 0
const MAX_TOPIC_POLL_CACHE_HIT_QUERIES = 0
const MAX_TOPIC_FEED_CACHE_HIT_QUERIES = 8

// one topic page load sends 21 reads of its own on this fixture: the topic, its user's access row and topic role, once
// each, the owner's identity and access row, the attachments, the Sources, the scans, the user's subscription twice,
// once for the page and once for the findings' gate, the team's shares and the user's teams, the two podcast episode
// reads, the image, the Topic Posts, the chat mentions, the findings, and two reads for the reactions and comment
// counts with one for the first thread page. an editor's page also counts their topic image regenerations this month.
// the related topics add four: the iterative index scan setting, the public ranking, the user's own ranking, and the
// check of the ranked topics. a page that leaves them to their own read sends the 21 alone, and that read sends the
// topic, the user's access row and topic role, and the same four
const MAX_TOPIC_PAGE_WITHOUT_RELATED_TOPICS_QUERIES = 21
const MAX_TOPIC_PAGE_QUERIES = MAX_TOPIC_PAGE_WITHOUT_RELATED_TOPICS_QUERIES + 4
const MAX_RELATED_TOPICS_QUERIES = 7

// one visitor's profile load of a person with one public topic sends 14 reads on this fixture: the person, their
// topics, the ids of the topics' podcast episodes and of their films, the Topic Posts, the subscriber count, the
// teams, the topic table's kept and seen counts and latest podcast episodes, and the topic cards' owners, team links,
// reactions, and latest podcast episodes
const MAX_PROFILE_QUERIES = 14

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

// the read that only a load with the related topics sends: the related topic ids
function isRelatedTopicsRead(sentQuery: SentQuery): boolean {
	return sentQuery.text.includes('from "topic_vectors"')
}

// the speech model, which turns podcast episodes on, and the secret that signs cover urls, put back after each test
const restorePodcastSettings = saveEnvSettings(["PODCAST_SPEECH_MODEL", "BETTER_AUTH_SECRET"])

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
	restorePodcastSettings()
	mock.restore()
})

// request a path through the api tree as the given user, with the request memo open as the server opens it,
// and return the response with how many queries the request sent
async function requestAsUser(path: string, userId: string | null): Promise<{ response: Response; queryCount: number }> {
	signInAs(userId)
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
			sentQuery.text.includes('"budget_override_cents"') &&
			sentQuery.text.includes('"admin_blocked_at" from "users"') &&
			sentQuery.values.includes("user-1"),
	)
	const roleReads = sentQueries.filter((sentQuery) => sentQuery.text.includes('"role" from "team_members"'))
	expect(accessReads).toHaveLength(1)
	expect(roleReads).toHaveLength(1)
})

// a poll reload leaves out the related topics read, which a full page load sends
test("a poll reload skips the related topics read", async () => {
	// a full load sends it, and a poll does not
	await requestAsUser("/api/topics/topic-1", "user-1")
	const fullLoadQueryCount = sentQueries.length
	expect(sentQueries.filter(isRelatedTopicsRead).length).toBeGreaterThanOrEqual(1)
	await requestAsUser("/api/topics/topic-1?poll=1", "user-1")
	expect(sentQueries.slice(fullLoadQueryCount).filter(isRelatedTopicsRead)).toHaveLength(0)
})

// a signed-in page that leaves the related topics to their own read sends no related read and returns none
test("a page that asks for separate related topics leaves them out inside its maximum", async () => {
	// a signed-in load with the flag stays inside the page's own reads
	const { response, queryCount } = await requestAsUser("/api/topics/topic-1?related=separate", "user-1")
	expect(response.status).toBe(200)
	expect(queryCount).toBeLessThanOrEqual(MAX_TOPIC_PAGE_WITHOUT_RELATED_TOPICS_QUERIES)

	// no related read was sent, and the list is empty with its shape kept
	expect(sentQueries.filter(isRelatedTopicsRead)).toHaveLength(0)
	expect(((await response.json()) as { relatedTopics: unknown[] }).relatedTopics).toEqual([])
})

// a visitor's page is the one every visitor shares, so it keeps its related topics whatever the query asks
test("a visitor's page keeps its related topics with the flag", async () => {
	const { response } = await requestAsUser("/api/topics/topic-1?related=separate", null)
	expect(response.status).toBe(200)
	expect(sentQueries.filter(isRelatedTopicsRead).length).toBeGreaterThanOrEqual(1)
})

// the related topics' own read sends the gate's reads and the related reads, and nothing of the page's
test("the related topics read stays inside its maximum", async () => {
	const { response, queryCount } = await requestAsUser("/api/topics/topic-1/related-topics", "user-1")
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ relatedTopics: [] })
	expect(sentQueries.filter(isRelatedTopicsRead).length).toBeGreaterThanOrEqual(1)
	expect(queryCount).toBeLessThanOrEqual(MAX_RELATED_TOPICS_QUERIES)
})

// a topic with published podcast episodes reads their ready and rendering films once for every list on the page
test("the topic page reads its podcast episodes' films once", async () => {
	// speech is on, cover urls can be signed, and the topic has two published podcast episodes
	Bun.env.PODCAST_SPEECH_MODEL = "test-speech-model"
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	restoreConnectionPool()
	sentQueries = stubConnectionPool((sentQuery) =>
		sentQuery.text.includes('from "episodes" where ("episodes"."topic_id" = $1 and "episodes"."status" = $2)')
			? [
					toPublishedPodcastEpisodeRow({ id: "episode-2", topicId: "topic-1", episodeNumber: 2 }),
					toPublishedPodcastEpisodeRow({ id: "episode-1", topicId: "topic-1", episodeNumber: 1 }),
				]
			: toBudgetQueryRows(sentQuery),
	)

	// one page load, and one film read among its queries, for both podcast episodes
	const { response } = await requestAsUser("/api/topics/topic-1", "user-1")
	const filmReads = sentQueries.filter((sentQuery) => sentQuery.text.includes('from "topic_podcast_episode_videos"'))
	expect(response.status).toBe(200)
	expect(filmReads).toHaveLength(1)
	expect(filmReads[0]?.values).toEqual(["episode-2", "episode-1", "ready", "rendering"])
})

// a profile reads the person's topics once, for the cards and the topic table, and stays inside its maximum
test("a profile reads the person's topics once inside its maximum", async () => {
	// the person, and the one public topic they own
	restoreConnectionPool()
	sentQueries = stubConnectionPool((sentQuery) => {
		if (sentQuery.text.includes('"avatar_key" from "users" where "users"."id" = $1')) {
			return [["owner-1", "Owner", new Date("2026-10-01T00:00:00Z"), null, null]]
		}
		return sentQuery.text.includes('from "topics" where ("topics"."owner_id" = $1') ? [TOPIC_ROW] : []
	})

	// a visitor's load, with one read of the topics among its queries
	const { response, queryCount } = await requestAsUser("/api/profiles/owner-1", null)
	const topicReads = sentQueries.filter((sentQuery) =>
		sentQuery.text.includes('from "topics" where ("topics"."owner_id"'),
	)
	expect(response.status).toBe(200)
	expect(topicReads).toHaveLength(1)
	expect(queryCount).toBeLessThanOrEqual(MAX_PROFILE_QUERIES)
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

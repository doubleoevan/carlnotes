// query budgets for the cached routes: each route is requested twice against the pool and Redis stubs, and the
// cache hit request's query count stays at or under the route's maximum. the topic page, its related topics, its scan
// history pages, and a profile stay inside theirs, and a visitor's topic page and home send no query on a warm copy
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery } from "@carlnotes/db/connectionPoolStub"
import * as redis from "@carlnotes/db/redis"
import { TOPIC_MEMORY_EMBEDDING_MODEL } from "@carlnotes/db/schema/topicMemories"
import { toTestPageHead } from "./pageReadTestFixtures"
import { toPublishedPodcastEpisodeRow } from "./podcast/podcastEpisodeTestFixtures"
import {
	endQueryBudgetTest,
	requestAsUser,
	startQueryBudgetTest,
	stubBudgetConnectionPool,
	stubPageReadFixture,
	TOPIC_ROW,
	toBudgetQueryRows,
} from "./queryBudgetsTestFixtures"
import * as pageHead from "./share/pageHead"

// the most queries a request may send: a Redis hit serves the mention count, the topic poll, and the feed's topic
// section ids without their reads
const MAX_MENTION_COUNT_CACHE_HIT_QUERIES = 0
const MAX_TOPIC_POLL_CACHE_HIT_QUERIES = 0
const MAX_TOPIC_FEED_CACHE_HIT_QUERIES = 8

// one topic page load sends 21 reads of its own on this fixture: the topic, its user's access row and topic role, once
// each, the owner's identity and access row, the attachments, the Sources, the scans, the user's subscription twice,
// once for the page and once for the findings' gate, the team's shares and the user's teams, the two podcast episode
// reads, the image, the Topic Posts, the chat mentions, the findings, and two reads for the reactions and comment
// counts with one for the first thread page. an editor's page also counts their topic image regenerations this month
// and reads their unchecked upload.
// the related topics add four: the iterative index scan setting, the public ranking, the user's own ranking, and the
// check of the ranked topics. a page that leaves them to their own read sends the 21 alone, and that read sends the
// topic, the user's access row and topic role, and the same four
const MAX_TOPIC_PAGE_WITHOUT_RELATED_TOPICS_QUERIES = 21
const MAX_TOPIC_PAGE_QUERIES = MAX_TOPIC_PAGE_WITHOUT_RELATED_TOPICS_QUERIES + 4
const MAX_RELATED_TOPICS_QUERIES = 7

// one visitor's profile load of a person with one public topic sends 15 reads on this fixture: the person, their
// topics, the ids of the topics' podcast episodes and of their films, the Topic Posts, the subscriber count, the
// teams, the topic table's kept and seen counts, latest podcast episodes, and owners, and the topic cards' owners, team
// links, reactions, and latest podcast episodes
const MAX_PROFILE_QUERIES = 15

// the queries the stubbed pool was sent, from the start of the test
let sentQueries: SentQuery[] = []

// the read that only a load with the related topics sends: the related topic ids
function isRelatedTopicsRead(sentQuery: SentQuery): boolean {
	return sentQuery.text.includes('from "topic_vectors"')
}

// one Redis with the related reads' centroid stored and one stubbed pool per test, with the console quiet
beforeEach(() => {
	sentQueries = startQueryBudgetTest()
})

// everything back after each test
afterEach(() => {
	endQueryBudgetTest()
	mock.restore()
})

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

// a full Journal's count rides the scans read: a number for the rows that stand alone and only the rows that can group
test("the topic page counts a Journal of 100 topic memories inside its scans read", async () => {
	// one succeeded Scan whose row holds 98 ungrouped rows and two statements of one fact
	const groupRow = { subject: '["cafe"]', claimType: "price", value: "usd 10", factDate: null }
	const groupRows = [
		{ ...groupRow, id: "memory-1", embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL, embedding: [1, 0] },
		{ ...groupRow, id: "memory-2", embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL, embedding: [0.99, 0.1] },
	]
	const startedAt = new Date("2026-11-18T09:00:00Z")
	const scanRow = ["scan-1", "succeeded", startedAt, startedAt, null, 5, 2, 3, "0.1", null]
	const headColumnsAndRecaps = [null, null, null, null, "0.1", null]
	sentQueries = stubBudgetConnectionPool((sentQuery) =>
		sentQuery.text.includes("'ungroupedCount'")
			? [[...scanRow, { ungroupedCount: 98, groupRows }, ...headColumnsAndRecaps]]
			: toBudgetQueryRows(sentQuery),
	)
	const { response, queryCount } = await requestAsUser("/api/topics/topic-1", "user-1")

	// the two statements count as one group beside the 98, with no read of the Journal apart from the scans read
	expect(response.status).toBe(200)
	expect(await response.json()).toMatchObject({ topicMemoryCount: 99 })
	expect(queryCount).toBeLessThanOrEqual(MAX_TOPIC_PAGE_QUERIES)
	expect(sentQueries.filter((sentQuery) => sentQuery.text.includes('from "topic_memories"'))).toHaveLength(1)
})

// a signed-in topic page reads the user's access row once and their topic role once, however many checks it makes
test("the topic page reads the user's access and topic role once", async () => {
	// one signed-in page load inside its maximum
	const { response, queryCount } = await requestAsUser("/api/topics/topic-1", "user-1")
	expect(response.status).toBe(200)
	expect(await response.json()).toMatchObject({ scans: [], topicMemoryCount: 0 })
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
	spyOn(pageHead, "loadTopicPageHead").mockResolvedValue(toTestPageHead("Agents"))
	const { response } = await requestAsUser("/api/topics/topic-1?related=separate", null)
	expect(response.status).toBe(200)
	expect(sentQueries.filter(isRelatedTopicsRead).length).toBeGreaterThanOrEqual(1)
})

// a read that asks for pages holds one page of the Topic Posts and the newest scans with their count, in no more reads
// than a whole read, and a read that asks for none holds both lists whole
test("a paged topic read holds one page of each list inside the whole read's count", async () => {
	const wholeRequest = await requestAsUser("/api/topics/topic-1", "user-1")
	const pagedRequest = await requestAsUser("/api/topics/topic-1?paged=1&topicPostsPage=0&scans=newest", "user-1")
	expect(pagedRequest.response.status).toBe(200)
	expect(pagedRequest.queryCount).toBeLessThanOrEqual(wholeRequest.queryCount)

	// the paged read says where its pages sit, and the whole read has no page
	const pagedTopic = (await pagedRequest.response.json()) as Record<string, unknown>
	expect(pagedTopic.topicPostsPage).toEqual({ page: 0, totalCount: 0 })
	expect(pagedTopic.scansPage).toEqual({ page: 0, totalCount: 0 })
	const wholeTopic = (await wholeRequest.response.json()) as Record<string, unknown>
	expect(wholeTopic.topicPostsPage).toBeUndefined()
	expect(wholeTopic.scansPage).toBeUndefined()
})

// a visitor's paged page read is cut from the topic's copy, so the warm read still sends no query, and the copy holds
// the newest page of scans
test("a visitor's paged topic page read is cut from the warm copy", async () => {
	// a cold visitor read stores the copy of a topic with one scan, and a paged read after it sends no query
	sentQueries = stubPageReadFixture()
	spyOn(pageHead, "loadTopicPageHead").mockResolvedValue(toTestPageHead("Agents"))
	await requestAsUser("/api/topics/topic-1/page", null)
	const warmRequest = await requestAsUser("/api/topics/topic-1/page?paged=1&scans=newest", null)
	expect(warmRequest.response.status).toBe(200)
	expect(warmRequest.queryCount).toBe(0)

	// the paged read holds a page of Topic Posts, and the copy's newest page of scans with the history's count
	const { topic } = (await warmRequest.response.json()) as { topic: Record<string, unknown> }
	expect(topic.topicPostsPage).toEqual({ page: 0, totalCount: 0 })
	expect(topic.scansPage).toEqual({ page: 0, totalCount: 1 })
})

// a visitor's released topic read that does not ask for the newest scans alone holds the whole history, from the copy
// with no query if the copy holds every scan
test("a visitor's topic read without the newest-scans flag holds the whole history", async () => {
	// the copy holds the history's one scan, so the read is served from it whole
	sentQueries = stubPageReadFixture()
	spyOn(pageHead, "loadTopicPageHead").mockResolvedValue(toTestPageHead("Agents"))
	await requestAsUser("/api/topics/topic-1/page", null)

	// the released read with no flag holds the one scan and no page
	const wholeRequest = await requestAsUser("/api/topics/topic-1", null)
	expect(wholeRequest.response.status).toBe(200)
	expect(wholeRequest.queryCount).toBe(0)
	const wholeTopic = (await wholeRequest.response.json()) as { scans: unknown[]; scansPage?: unknown }
	expect(wholeTopic.scans).toHaveLength(1)
	expect(wholeTopic.scansPage).toBeUndefined()

	// a flagged read gets the copy's page and count
	const newestRequest = await requestAsUser("/api/topics/topic-1?scans=newest", null)
	expect(((await newestRequest.response.json()) as { scansPage?: unknown }).scansPage).toEqual({
		page: 0,
		totalCount: 1,
	})
})

// a later page of the scan history reads its own page of scans, and counts the topic's scans if the page is empty
test("a later page of the scan history returns its scans and the topic's scan count", async () => {
	const { response } = await requestAsUser("/api/topics/topic-1/scans?page=3", "user-1")
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ scans: [], totalCount: 0 })
	expect(sentQueries.some(({ text }) => text.includes("offset"))).toBe(true)
})

// a visitor's topic page read is built once and then served from its copy, so the warm read sends no query, and a
// signed-in read is built for the reader each time and fills no copy
test("a visitor's topic page read sends no query on a warm copy, and a signed-in read is never served from it", async () => {
	spyOn(pageHead, "loadTopicPageHead").mockResolvedValue(toTestPageHead("Agents"))
	const signedInRequest = await requestAsUser("/api/topics/topic-1/page", "user-1")
	const coldRequest = await requestAsUser("/api/topics/topic-1/page", null)
	const warmRequest = await requestAsUser("/api/topics/topic-1/page", null)
	expect(signedInRequest.response.status).toBe(200)
	expect(coldRequest.response.status).toBe(200)
	expect(warmRequest.response.status).toBe(200)

	// the signed-in read left nothing to serve, so the visitor's first read built the page, and the second sent nothing
	expect(coldRequest.queryCount).toBeGreaterThan(0)
	expect(warmRequest.queryCount).toBe(0)
	expect(await warmRequest.response.json()).toEqual(await coldRequest.response.json())
})

// a visitor's home is one copy every visitor shares
test("a visitor's home sends no query on a warm copy", async () => {
	const coldRequest = await requestAsUser("/api/home", null)
	const warmRequest = await requestAsUser("/api/home", null)
	expect(coldRequest.response.status).toBe(200)
	expect(warmRequest.queryCount).toBe(0)
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
	sentQueries = stubBudgetConnectionPool((sentQuery) =>
		sentQuery.text.includes('"episodes"."id" in (select "id" from "episodes"')
			? [
					[...toPublishedPodcastEpisodeRow({ id: "episode-2", topicId: "topic-1", episodeNumber: 2 }), true, true],
					[...toPublishedPodcastEpisodeRow({ id: "episode-1", topicId: "topic-1", episodeNumber: 1 }), true, false],
				]
			: toBudgetQueryRows(sentQuery),
	)

	// one page load, and one film read among its queries, for both podcast episodes
	const { response } = await requestAsUser("/api/topics/topic-1", "user-1")
	const filmReads = sentQueries.filter((sentQuery) => sentQuery.text.includes('from "topic_videos"'))
	expect(response.status).toBe(200)
	expect(filmReads).toHaveLength(1)
	expect(filmReads[0]?.values).toEqual(["episode-2", "episode-1", "ready", "rendering"])

	// one reactions read for the topic, its findings, and its podcast episodes' film cards, and none of its own for the
	// cards
	const reactionReads = sentQueries.filter((sentQuery) => sentQuery.text.includes('from "reactions"'))
	expect(reactionReads).toHaveLength(1)
	expect(reactionReads[0]?.values).toEqual(expect.arrayContaining(["topic-1", "episode-2", "episode-1"]))
})

// a profile reads the person's topics once, for the cards and the topic table, and stays inside its maximum
test("a profile reads the person's topics once inside its maximum", async () => {
	// the person, and the one public topic they own or a team they lead holds
	restoreConnectionPool()
	sentQueries = stubBudgetConnectionPool((sentQuery) => {
		if (sentQuery.text.includes('"profile_viewer_count" from "users" where "users"."id" = $1')) {
			return [["owner-1", "Owner", new Date("2026-10-01T00:00:00Z"), null, null, null, 0]]
		}
		return sentQuery.text.includes('from "topics" where (("topics"."owner_id" = $1') ? [TOPIC_ROW] : []
	})

	// a visitor's load, with one read of the topics among its queries
	const { response, queryCount } = await requestAsUser("/api/profiles/owner-1", null)
	const topicReads = sentQueries.filter((sentQuery) =>
		sentQuery.text.includes('from "topics" where (("topics"."owner_id"'),
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

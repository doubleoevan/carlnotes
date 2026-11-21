// visitor page copy tests: a shared read is stored and read back without a load, a gated or missing read is never
// stored, and a topic's clear deletes the copy of every page that shows it in one delete
import { afterEach, beforeEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "./redisClientStub"
import {
	clearVisitorPagesOfTopic,
	readVisitorPage,
	toVisitorHomePageKey,
	toVisitorPodcastEpisodePageKey,
	toVisitorProfilePageKey,
	toVisitorTeamPageKey,
	toVisitorTopicPageKey,
	toVisitorTopicPostPageKey,
} from "./visitorPageCaches"

// the fake Redis map each test starts with
let storedValueByKey: Map<string, string>

// a fresh Redis map before each test, and the real pool and client after it
beforeEach(() => {
	storedValueByKey = stubRedisClient()
})
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

test("a shared read is stored and read back without a second load", async () => {
	// the first read builds the page and stores it
	let loadCount = 0
	const load = async () => {
		loadCount += 1
		return { topicName: "Coffee" }
	}
	const key = toVisitorTopicPageKey("topic-1")
	expect(await readVisitorPage({ key, pageKind: "topic", load, isShared: () => true })).toEqual({ topicName: "Coffee" })
	expect(storedValueByKey.has(key)).toBe(true)

	// the second read is the copy
	expect(await readVisitorPage({ key, pageKind: "topic", load, isShared: () => true })).toEqual({ topicName: "Coffee" })
	expect(loadCount).toBe(1)
})

test("a gated or missing read is returned and never stored", async () => {
	const key = toVisitorTopicPageKey("topic-1")
	const gatedRead = await readVisitorPage({
		key,
		pageKind: "topic",
		load: async () => ({ topicGate: { topicName: "Coffee" } }),
		isShared: () => false,
	})
	expect(gatedRead).toEqual({ topicGate: { topicName: "Coffee" } })
	expect(storedValueByKey.has(key)).toBe(false)
})

test("every page's key is its own", () => {
	const keys = [
		toVisitorProfilePageKey("id-1"),
		toVisitorTeamPageKey("id-1"),
		toVisitorHomePageKey(),
		toVisitorTopicPageKey("id-1"),
		toVisitorPodcastEpisodePageKey({ topicId: "id-1", season: 2026, episodeNumber: 1 }),
		toVisitorTopicPostPageKey("id-1"),
	]
	expect(new Set(keys).size).toBe(keys.length)
	expect(keys.every((key) => key.startsWith("visitor-page:"))).toBe(true)
})

test("a topic's clear deletes its page, its podcast episode and post pages, and the profiles and teams that list it", async () => {
	// the topic's owner, its owning team, a sharing team, one published podcast episode, and one published post
	const sentQueries = stubConnectionPool(() => [
		[
			"topic-1",
			"owner-1",
			"team-1",
			["team-2"],
			[{ season: 2026, episodeNumber: 3 }],
			[{ id: "post-1", authorUserId: "author-1" }],
		],
	])
	const clearedKeys = [
		toVisitorTopicPageKey("topic-1"),
		toVisitorPodcastEpisodePageKey({ topicId: "topic-1", season: 2026, episodeNumber: 3 }),
		toVisitorTopicPostPageKey("post-1"),
		toVisitorProfilePageKey("owner-1"),
		toVisitorProfilePageKey("author-1"),
		toVisitorTeamPageKey("team-1"),
		toVisitorTeamPageKey("team-2"),
	]
	const keptKey = toVisitorTopicPageKey("topic-2")
	for (const key of [...clearedKeys, keptKey]) {
		storedValueByKey.set(key, "{}")
	}

	// one read finds the keys, and every copy that shows the topic goes
	await clearVisitorPagesOfTopic("topic-1")
	expect(sentQueries).toHaveLength(1)
	expect(clearedKeys.filter((key) => storedValueByKey.has(key))).toEqual([])
	expect(storedValueByKey.has(keptKey)).toBe(true)
})

test("a clear of several topics reads them in one statement", async () => {
	// two topics with an owner each, one listed twice
	const sentQueries = stubConnectionPool(() => [
		["topic-1", "owner-1", null, null, null, null],
		["topic-2", "owner-2", null, null, null, null],
	])
	for (const key of [
		toVisitorTopicPageKey("topic-1"),
		toVisitorTopicPageKey("topic-2"),
		toVisitorProfilePageKey("owner-2"),
	]) {
		storedValueByKey.set(key, "{}")
	}

	// one read, and both topics' copies go
	await clearVisitorPagesOfTopic("topic-1", "topic-2", "topic-1")
	expect(sentQueries).toHaveLength(1)
	expect(storedValueByKey.size).toBe(0)
})

test("a topic that is gone clears its own page alone", async () => {
	stubConnectionPool(() => [])
	storedValueByKey.set(toVisitorTopicPageKey("topic-1"), "{}")
	storedValueByKey.set(toVisitorProfilePageKey("owner-1"), "{}")
	await clearVisitorPagesOfTopic("topic-1")
	expect([...storedValueByKey.keys()]).toEqual([toVisitorProfilePageKey("owner-1")])
})

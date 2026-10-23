// topic source tool tests for the cost delta, the source input and match, the source limit, and the visitors' cached
// copies that a source change drops
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { SCAN_COST_CENTS } from "@carlnotes/contracts/plans"
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { toVisitorTopicPageKey } from "../topic/feeds"
import {
	addTopicSource,
	isSameTopicSource,
	removeTopicSource,
	toNewTopicSource,
	toTopicSourceCostDelta,
} from "./topicSourceTools"
import * as topicTools from "./topicTools"

// put the pool, the Redis client, and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// a topic with scans spreads its mean scan cost across its ready sources
test("the cost delta is the mean recent scan cost shared across the ready sources", () => {
	const topicSourceCostDelta = toTopicSourceCostDelta({
		recentScanCostDollars: [0.1, 0.2, 0.3],
		readyTopicSourceCount: 4,
		sourceKind: "rss",
		frequency: "daily",
	})
	expect(topicSourceCostDelta.perScanCents).toBe(5)
	expect(topicSourceCostDelta.perMonthCents).toBe(150)
})

// a topic that never scanned takes a share of the average scan cost, and a weekly topic scans four times a month
test("a topic with no scans falls back to a share of the average scan cost at its frequency", () => {
	const topicSourceCostDelta = toTopicSourceCostDelta({
		recentScanCostDollars: [],
		readyTopicSourceCount: 0,
		sourceKind: "rss",
		frequency: "weekly",
	})
	expect(topicSourceCostDelta.perScanCents).toBe(SCAN_COST_CENTS / 5)
	expect(topicSourceCostDelta.perMonthCents).toBe(Math.round((SCAN_COST_CENTS / 5) * 4))
})

// a paid kind adds its ingestion cost to the per-source cost
test("a paid kind adds its ingestion price to the delta", () => {
	const searchCostDelta = toTopicSourceCostDelta({
		recentScanCostDollars: [0.1],
		readyTopicSourceCount: 1,
		sourceKind: "search",
		frequency: "daily",
	})
	const rssCostDelta = toTopicSourceCostDelta({
		recentScanCostDollars: [0.1],
		readyTopicSourceCount: 1,
		sourceKind: "rss",
		frequency: "daily",
	})
	expect(searchCostDelta.perScanCents).toBeGreaterThan(rssCostDelta.perScanCents)
})

// a topic with scans but no ready source divides by one
test("a zero ready source count divides by one", () => {
	const topicSourceCostDelta = toTopicSourceCostDelta({
		recentScanCostDollars: [0.1],
		readyTopicSourceCount: 0,
		sourceKind: "rss",
		frequency: "daily",
	})
	expect(topicSourceCostDelta.perScanCents).toBe(10)
})

// a default source takes no value, a custom one builds its config from the value, and a blank value is rejected
test("a source input is built through the registry", () => {
	expect(toNewTopicSource("webSearch", "")).toEqual({ sourceKind: "search", config: {} })
	expect(toNewTopicSource("reddit", "r/startups")).toEqual({ sourceKind: "reddit", config: { subreddit: "startups" } })
	expect(toNewTopicSource("rss", "   ")).toBeNull()
})

// two sources match by kind and value, whatever else the stored config holds
test("a stored source matches a new one by kind and value", () => {
	const storedRedditTopicSource = { kind: "reddit", config: { subreddit: "startups", name: "Startups" } }
	expect(isSameTopicSource(storedRedditTopicSource, { sourceKind: "reddit", config: { subreddit: "startups" } })).toBe(
		true,
	)
	expect(isSameTopicSource(storedRedditTopicSource, { sourceKind: "reddit", config: { subreddit: "founders" } })).toBe(
		false,
	)
	expect(isSameTopicSource({ kind: "search", config: {} }, { sourceKind: "search", config: {} })).toBe(true)
	expect(
		isSameTopicSource(
			{ kind: "rss", config: { url: "https://a.test/feed" } },
			{ sourceKind: "url", config: { url: "https://a.test/feed" } },
		),
	).toBe(false)
})

// the tool rejects at the shared source limit of ten
test("the source limit is the shared constant", () => {
	expect(MAX_TOPIC_SOURCES).toBe(10)
})

// the visitors' feed shows a public topic's sources, so adding or removing one drops the feed copy with the page copy
test("a source added to or removed from a public topic drops the visitors' feed and page copies", async () => {
	// a public topic the user may edit, and one Redis holding the topic's page copy and a feed view
	spyOn(topicTools, "loadEditableTopic").mockResolvedValue({
		status: "ok",
		userId: "user-1",
		topic: { id: "t1", visibility: "public", frequency: "daily" } as never,
	})
	const storedValueByKey = stubRedisClient()
	const fillVisitorCopies = (): void => {
		storedValueByKey.set(toVisitorTopicPageKey("t1"), "{}")
		storedValueByKey.set("topic-feed:visitor:unread", "{}")
	}

	// an added source, into a topic with no sources or scans, drops both copies
	fillVisitorCopies()
	stubConnectionPool(({ text }) => (text.startsWith("insert") ? [["source-1"]] : []))
	const addTopicSourceResult = await addTopicSource({
		userId: "user-1",
		topicId: "t1",
		sourceOption: "rss",
		value: "https://a.test/feed",
		origin: "chat",
	})
	expect(addTopicSourceResult.status).toBe("saved")
	expect(storedValueByKey.size).toBe(0)

	// a removed source drops both copies too
	fillVisitorCopies()
	stubConnectionPool(toRemovalQueryRows({ sourceKind: "rss", sourceCount: 2 }))
	const removeTopicSourceResult = await removeTopicSource({
		userId: "user-1",
		topicId: "t1",
		sourceId: "source-1",
		origin: "chat",
	})
	expect(removeTopicSourceResult.status).toBe("saved")
	expect(storedValueByKey.size).toBe(0)
})

// the rows a source removal reads: the source row, the topic row it locks, and the topic's source count
function toRemovalQueryRows({
	sourceKind,
	sourceCount,
}: {
	sourceKind: string
	sourceCount: number
}): (sentQuery: { text: string }) => unknown[][] {
	// the count query returns the source count, and every other select returns the source row
	return ({ text }) => {
		if (text.includes("count(")) {
			return [[sourceCount]]
		}
		return text.startsWith("select") ? [["t1", sourceKind, { url: "https://a.test/feed" }]] : []
	}
}

// stub the gate so the user may edit topic t1
function stubEditableTopic(): void {
	spyOn(topicTools, "loadEditableTopic").mockResolvedValue({
		status: "ok",
		userId: "user-1",
		topic: { id: "t1", visibility: "private", frequency: "daily" } as never,
	})
}

// web search stays on a topic
test("removeTopicSource keeps web search and deletes nothing", async () => {
	stubEditableTopic()
	stubRedisClient()
	const sentQueries = stubConnectionPool(toRemovalQueryRows({ sourceKind: "search", sourceCount: 3 }))
	const removeTopicSourceResult = await removeTopicSource({
		userId: "user-1",
		topicId: "t1",
		sourceId: "s1",
		origin: "chat",
	})
	expect(removeTopicSourceResult.status).toBe("webSearch")
	expect(sentQueries.some(({ text }) => text.startsWith("delete"))).toBe(false)
})

// a topic keeps at least one source, counted under a lock on the topic row
test("removeTopicSource keeps a topic's last source, counting it under the topic row's lock", async () => {
	stubEditableTopic()
	stubRedisClient()
	const sentQueries = stubConnectionPool(toRemovalQueryRows({ sourceKind: "rss", sourceCount: 1 }))
	const removeTopicSourceResult = await removeTopicSource({
		userId: "user-1",
		topicId: "t1",
		sourceId: "s1",
		origin: "chat",
	})
	expect(removeTopicSourceResult.status).toBe("lastSource")
	expect(sentQueries.some(({ text }) => text.startsWith("delete"))).toBe(false)

	// the topic row is locked before the count
	const lockIndex = sentQueries.findIndex(({ text }) => text.includes("for no key update"))
	const countIndex = sentQueries.findIndex(({ text }) => text.includes("count("))
	expect(lockIndex).toBeGreaterThan(-1)
	expect(lockIndex).toBeLessThan(countIndex)
})

// a topic with another source left removes the one asked for
test("removeTopicSource deletes a source if the topic keeps another", async () => {
	stubEditableTopic()
	stubRedisClient()
	const sentQueries = stubConnectionPool(toRemovalQueryRows({ sourceKind: "rss", sourceCount: 2 }))
	const removeTopicSourceResult = await removeTopicSource({
		userId: "user-1",
		topicId: "t1",
		sourceId: "s1",
		origin: "chat",
	})
	expect(removeTopicSourceResult.status).toBe("saved")
	expect(sentQueries.some(({ text }) => text.startsWith("delete"))).toBe(true)
})

// a removal that ran at the same time deleted the row first, so the second one is saved instead of the last source
test("removeTopicSource returns saved if the row is gone once the topic row is locked", async () => {
	stubEditableTopic()
	stubRedisClient()
	const toQueryRows = toRemovalQueryRows({ sourceKind: "rss", sourceCount: 1 })
	const sentQueries = stubConnectionPool((sentQuery) =>
		sentQuery.text.includes('"sources"."topic_id" = ') ? [] : toQueryRows(sentQuery),
	)
	const removeTopicSourceResult = await removeTopicSource({
		userId: "user-1",
		topicId: "t1",
		sourceId: "s1",
		origin: "chat",
	})
	expect(removeTopicSourceResult).toEqual({ status: "saved", topicSourceLabel: null })
	expect(sentQueries.some(({ text }) => text.includes("count("))).toBe(false)
	expect(sentQueries.some(({ text }) => text.startsWith("delete"))).toBe(false)
})

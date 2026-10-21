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
	stubConnectionPool(({ text }) => (text.startsWith("select") ? [["t1", "rss", { url: "https://a.test/feed" }]] : []))
	const removeTopicSourceResult = await removeTopicSource({
		userId: "user-1",
		topicId: "t1",
		sourceId: "source-1",
		origin: "chat",
	})
	expect(removeTopicSourceResult.status).toBe("saved")
	expect(storedValueByKey.size).toBe(0)
})

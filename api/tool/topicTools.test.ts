// topic tool tests for the cost delta, the source input and match, and the prompt version write
import { expect, test } from "bun:test"
import { MAX_TOPIC_SOURCES } from "@shared/contracts"
import { SCAN_COST_CENTS } from "@shared/plans"
import { savePromptVersion } from "../topic/promptVersions"
import { isSameTopicSource, toNewTopicSource, toTopicSourceCostDelta } from "./topicTools"

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

// an unchanged prompt writes no version, and a changed one does
test("the version write skips an unchanged prompt and saves a changed one", async () => {
	// a fake transaction that keeps every insertedRows insertedRow
	const insertedRows: unknown[] = []
	const transaction = {
		insert: () => ({
			values: async (insertedRow: unknown) => {
				insertedRows.push(insertedRow)
			},
		}),
	} as never

	// save the same text twice
	await savePromptVersion(transaction, {
		topicId: "topic-1",
		prompt: "same",
		userId: "user-1",
		origin: "editor",
		previousPrompt: "same",
	})
	expect(insertedRows).toEqual([])

	// save a changed prompt
	await savePromptVersion(transaction, {
		topicId: "topic-1",
		prompt: "new",
		userId: "user-1",
		origin: "chat",
		previousPrompt: "same",
	})
	expect(insertedRows).toEqual([{ topicId: "topic-1", prompt: "new", savedByUserId: "user-1", origin: "chat" }])
})

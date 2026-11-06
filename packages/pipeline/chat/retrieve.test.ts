// retrieval tests: the topic ranking's query collects the topics' findings in a materialized common table expression
// and ranks that set, and recency breaks a near-tie in that order
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as models from "@carlnotes/models/models"
import { retrieveChatContext, searchTopicFindings, toRelevanceThenRecencyOrder } from "./retrieve"

// put the pool and the embedding spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the ranking's statement: the topic filter inside the materialized expression, the order by distance outside it
test("the topic ranking filters to the topic inside a materialized expression and ranks outside it", async () => {
	// a question vector, and a pool that records the statement and returns no rows
	spyOn(models, "embedVector").mockResolvedValue([0.1, 0.2, 0.3])
	const sentQueries = stubConnectionPool()
	expect(await searchTopicFindings("topic-1", null, "what changed", 8)).toEqual([])

	// one statement, with the fence, the topic filter, and the ranking in that order
	expect(sentQueries).toHaveLength(1)
	const statement = sentQueries[0]?.text ?? ""
	const fenceIndex = statement.indexOf("as materialized (")
	const topicFilterIndex = statement.indexOf('"findings"."topic_id" in (')
	const rankingIndex = statement.indexOf("select * from topic_findings order by distance limit")
	expect(statement).toStartWith("with topic_findings as materialized (")
	expect(topicFilterIndex).toBeGreaterThan(fenceIndex)
	expect(rankingIndex).toBeGreaterThan(topicFilterIndex)

	// no order inside the fence, and the topic, the question vector, and the limit among the values
	expect(statement.slice(0, rankingIndex)).not.toContain("order by")
	expect(sentQueries[0]?.values).toContain("topic-1")
	expect(sentQueries[0]?.values).toContain("[0.1,0.2,0.3]")
	expect(sentQueries[0]?.values.at(-1)).toBe(8)
})

// an invite that has not activated reads no finding from a scan before its activation
test("the topic ranking gates an invite topic's scans on the reader's activation", async () => {
	spyOn(models, "embedVector").mockResolvedValue([0.1, 0.2, 0.3])
	const sentQueries = stubConnectionPool()
	await searchTopicFindings("topic-1", "invited-reader", "what changed", 8)

	// the gate reads the user's own active subscription and leaves a role on the topic and an admin account open
	const statement = sentQueries[0]?.text ?? ""
	expect(statement).toContain('"topics"."visibility" <> $')
	expect(statement).toContain('"scans"."started_at" > ((select min("created_at") from "subscriptions"')
	expect(statement).toContain('"subscriptions"."is_active" = $')
	expect(statement).toContain('"users"."role" = $')
	expect(statement).toContain('"topics"."owner_id" = $')
	expect(sentQueries[0]?.values).toContain("invited-reader")
})

// a visitor holds no subscription, so an invite topic's scans stay closed
test("a visitor's topic ranking reads no invite topic's scans", async () => {
	spyOn(models, "embedVector").mockResolvedValue([0.1, 0.2, 0.3])
	const sentQueries = stubConnectionPool()
	await searchTopicFindings("topic-1", null, "what changed", 8)
	expect(sentQueries[0]?.text).toContain('"topics"."visibility" <> $')
	expect(sentQueries[0]?.text).not.toContain('"subscriptions"')
})

// a chat turn on a shared topic reads no personal Source and no Scan before the user's activation
test("chat retrieval leaves personal Sources out and gates Scan summaries", async () => {
	spyOn(models, "embedVector").mockResolvedValue([0.1, 0.2, 0.3])
	spyOn(models, "embedVectors").mockResolvedValue([[0.1, 0.2, 0.3]])
	const sentQueries = stubConnectionPool((query) =>
		query.text.startsWith('select "name"') ? [["Topic", "Prompt", "daily", null, null, "invite", [], 10]] : [],
	)
	await retrieveChatContext("topic-1", "what changed", "invited-reader", false, { litellmApiKey: "fixture-key" })

	// the Sources read names the shared kinds, and the summaries read includes the activation gate
	const sourcesQuery = sentQueries.find((query) => query.text.includes('from "sources"'))
	expect(sourcesQuery?.text).toContain('"sources"."kind" not in')
	expect(sourcesQuery?.values).toEqual(expect.arrayContaining(["ai_agent", "email"]))
	const summariesQuery = sentQueries.find((query) => query.text.includes('"scan_summary"'))
	expect(summariesQuery?.text).toContain('"scans"."started_at" > ((select min("created_at") from "subscriptions"')
	expect(summariesQuery?.values).toContain("invited-reader")
})

// findings that answer the question equally well are ordered by when this topic found them
test("recency breaks a near-tie in similarity but never beats a clearly better match", () => {
	const findingRow = (distance: number, foundAt: string): { distance: number; foundAt: Date } => ({
		distance,
		foundAt: new Date(foundAt),
	})

	// two findings inside the tie band come back newest first, whichever order they arrived in
	const nearTies = [findingRow(0.21, "2026-01-01"), findingRow(0.2, "2026-06-01")]
	expect(toRelevanceThenRecencyOrder(nearTies).map((findingRow) => findingRow.foundAt.getFullYear())).toEqual([
		2026, 2026,
	])
	expect(toRelevanceThenRecencyOrder(nearTies)[0]?.foundAt.getMonth()).toBe(5)

	// a much closer match leads even when it is the older
	const clearWinner = [findingRow(0.9, "2026-06-01"), findingRow(0.2, "2026-01-01")]
	expect(toRelevanceThenRecencyOrder(clearWinner)[0]?.distance).toBe(0.2)
})

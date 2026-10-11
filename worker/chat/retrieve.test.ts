// retrieval tests: the topic ranking's query collects the topics' findings in a materialized common table expression
// and ranks that set, and recency breaks a near-tie in that order
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "../../db/connectionPoolStub"
import * as models from "../models"
import { searchTopicFindings, toRelevanceThenRecencyOrder } from "./retrieve"

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
	expect(await searchTopicFindings("topic-1", "what changed", 8)).toEqual([])

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

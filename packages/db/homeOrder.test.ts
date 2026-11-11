// home order tests: the position a ranked row takes, and the statements the write and the release send
import { afterEach, describe, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { releaseHomeOrder, releaseTopicHomeOrders, setHomeOrder } from "./homeOrder"
import { db } from "./index"
import { toTargetPosition } from "./pinnedOrder"
import { podcastEpisodes } from "./schema/podcast"
import { topicPosts } from "./schema/topicPosts"
import { topics } from "./schema/topics"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// every update also stamps updated_at, which takes a placeholder of its own
const UPDATED_AT = expect.any(String)

describe("the position a ranked row takes", () => {
	test("a row joining an ordering it was not in takes the position offered", () => {
		// three pinned rows, so the home order selector offers 1 through 4 and none of them is past the end
		expect(toTargetPosition(1, 3)).toBe(1)
		expect(toTargetPosition(2, 3)).toBe(2)
		expect(toTargetPosition(4, 3)).toBe(4)
	})

	test("a row already pinned appends to the end instead of past it", () => {
		// the selector offered 4 against four pinned rows, and the row has since left the ordering
		expect(toTargetPosition(4, 3)).toBe(4)
		expect(toTargetPosition(5, 3)).toBe(4)
	})

	test("the first pinned row takes position one", () => {
		expect(toTargetPosition(1, 0)).toBe(1)
	})
})

describe("the write", () => {
	test("a topic not yet pinned is inserted at its position and the rows from there move down", async () => {
		// the topic has no order, and three topics are pinned
		const sentQueries = stubConnectionPool(({ text }) => (text.includes("count(*)") ? [[3]] : [[null]]))
		await db.transaction(async (transaction) => {
			await setHomeOrder({ table: topics, id: "topic-1", position: 2, transaction })
		})

		// the release reads the order, the count sizes the insert, the bump makes room, and the set takes the position
		expect(sentQueries.map(({ text }) => text)).toEqual([
			'select "feature_order" from "topics" where "topics"."id" = $1',
			'select count(*) from "topics" where "topics"."feature_order" is not null',
			'update "topics" set "feature_order" = "topics"."feature_order" + 1, "updated_at" = $1 where ("topics"."feature_order" is not null and "topics"."feature_order" >= $2)',
			'update "topics" set "feature_order" = $1, "updated_at" = $2 where "topics"."id" = $3',
		])
		expect(sentQueries[2]?.values).toEqual([UPDATED_AT, 2])
		expect(sentQueries[3]?.values).toEqual([2, UPDATED_AT, "topic-1"])
	})

	test("a position past the end appends", async () => {
		// three podcast episodes are pinned, and the fifth position is offered
		const sentQueries = stubConnectionPool(({ text }) => (text.includes("count(*)") ? [[3]] : [[null]]))
		await db.transaction(async (transaction) => {
			await setHomeOrder({ table: podcastEpisodes, id: "episode-1", position: 5, transaction })
		})
		expect(sentQueries[3]?.text).toBe(
			'update "episodes" set "feature_order" = $1, "updated_at" = $2 where "episodes"."id" = $3',
		)
		expect(sentQueries[3]?.values).toEqual([4, UPDATED_AT, "episode-1"])
	})

	test("position zero only releases", async () => {
		// the row holds the second position
		const sentQueries = stubConnectionPool(() => [[2]])
		await db.transaction(async (transaction) => {
			await setHomeOrder({ table: topics, id: "topic-1", position: 0, transaction })
		})
		expect(sentQueries.map(({ text }) => text)).toEqual([
			'select "feature_order" from "topics" where "topics"."id" = $1',
			'update "topics" set "feature_order" = $1, "updated_at" = $2 where "topics"."id" = $3',
			'update "topics" set "feature_order" = "topics"."feature_order" - 1, "updated_at" = $1 where ("topics"."feature_order" is not null and "topics"."feature_order" > $2)',
		])
		expect(sentQueries[1]?.values).toEqual([null, UPDATED_AT, "topic-1"])
		expect(sentQueries[2]?.values).toEqual([UPDATED_AT, 2])
	})
})

describe("the release", () => {
	test("a row with no order sends no write and reports none released", async () => {
		const sentQueries = stubConnectionPool(() => [[null]])
		expect(await releaseHomeOrder({ table: podcastEpisodes, id: "episode-1", handle: db })).toBe(false)
		expect(sentQueries).toHaveLength(1)
	})

	test("a pinned row is cleared and the rows below it move up", async () => {
		const sentQueries = stubConnectionPool(() => [[3]])
		expect(await releaseHomeOrder({ table: podcastEpisodes, id: "episode-1", handle: db })).toBe(true)
		expect(sentQueries.map(({ text }) => text)).toEqual([
			'select "feature_order" from "episodes" where "episodes"."id" = $1',
			'update "episodes" set "feature_order" = $1, "updated_at" = $2 where "episodes"."id" = $3',
			'update "episodes" set "feature_order" = "episodes"."feature_order" - 1, "updated_at" = $1 where ("episodes"."feature_order" is not null and "episodes"."feature_order" > $2)',
		])
		expect(sentQueries[1]?.values).toEqual([null, UPDATED_AT, "episode-1"])
		expect(sentQueries[2]?.values).toEqual([UPDATED_AT, 3])
	})

	test("a topic's pinned Topic Posts are each cleared in turn, and a topic with none reports none released", async () => {
		// the topic's two pinned posts, then each one's order, and a write returns no row
		const sentQueries = stubConnectionPool(({ text }) => {
			if (text.startsWith('select "id" from "topic_posts"')) {
				return [["post-1"], ["post-2"]]
			}
			return text.startsWith("select") ? [[1]] : []
		})
		expect(await releaseTopicHomeOrders({ table: topicPosts, topicId: "topic-1", handle: db })).toBe(true)

		// the read takes the topic's pinned posts alone, and each post is cleared
		expect(sentQueries[0]?.text).toBe(
			'select "id" from "topic_posts" where ("topic_posts"."topic_id" = $1 and "topic_posts"."home_order" is not null)',
		)
		const clearedIds = sentQueries
			.filter(({ text }) => text.startsWith('update "topic_posts" set "home_order" = $1'))
			.map(({ values }) => values[2])
		expect(clearedIds).toEqual(["post-1", "post-2"])

		// a topic with no pinned post sends the one read
		const emptyQueries = stubConnectionPool(() => [])
		expect(await releaseTopicHomeOrders({ table: topicPosts, topicId: "topic-2", handle: db })).toBe(false)
		expect(emptyQueries).toHaveLength(1)
	})
})

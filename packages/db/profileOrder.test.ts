// profile order tests: an owner features inside their own topics, podcast episodes, and films, up to the limit, and an
// author inside their own Topic Posts, with no limit, and a topic that leaves the public set and a removed podcast
// episode release their featured items
import { afterEach, describe, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { db } from "./index"
import {
	releaseTopicPostProfileOrder,
	releaseTopicProfileOrders,
	releaseTopicVideoProfileOrders,
	setPodcastEpisodeProfileOrder,
	setTopicPostProfileOrder,
	setTopicProfileOrder,
	setTopicVideoProfileOrder,
} from "./profileOrder"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// every update also stamps updated_at, which takes a placeholder of its own
const UPDATED_AT = expect.any(String)

describe("a profile order", () => {
	test("a topic joins its owner's featured items alone, counted and moved inside that owner's topics", async () => {
		// the topic has no order, and its owner has featured three topics
		const sentQueries = stubConnectionPool(({ text }) => (text.includes("count(*)") ? [[3]] : [[null]]))
		const isRanked = await db.transaction((transaction) =>
			setTopicProfileOrder({ id: "topic-1", ownerId: "owner-1", position: 2, transaction }),
		)
		expect(isRanked).toBe(true)

		// the limit check reads the order and the count, then the write runs as the home's does, scoped to the owner
		const scopedCount =
			'select count(*) from "topics" where ("topics"."profile_order" is not null and "topics"."owner_id" = $1)'
		expect(sentQueries.map(({ text }) => text)).toEqual([
			'select "profile_order" from "topics" where "topics"."id" = $1',
			scopedCount,
			'select "profile_order" from "topics" where "topics"."id" = $1',
			scopedCount,
			'update "topics" set "profile_order" = "topics"."profile_order" + 1, "updated_at" = $1 where (("topics"."profile_order" is not null and "topics"."owner_id" = $2) and "topics"."profile_order" >= $3)',
			'update "topics" set "profile_order" = $1, "updated_at" = $2 where "topics"."id" = $3',
		])
		expect(sentQueries[4]?.values).toEqual([UPDATED_AT, "owner-1", 2])
	})

	test("a thirteenth featured item is rejected and writes nothing", async () => {
		// the topic has no order, and its owner already holds twelve featured items
		const sentQueries = stubConnectionPool(({ text }) => (text.includes("count(*)") ? [[12]] : [[null]]))
		const isRanked = await db.transaction((transaction) =>
			setTopicProfileOrder({ id: "topic-13", ownerId: "owner-1", position: 1, transaction }),
		)
		expect(isRanked).toBe(false)
		expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
	})

	test("a featured topic still moves on a full profile, and a clear still clears", async () => {
		// the topic holds position four of twelve
		const sentQueries = stubConnectionPool(({ text }) => (text.includes("count(*)") ? [[12]] : [[4]]))
		const isMoved = await db.transaction((transaction) =>
			setTopicProfileOrder({ id: "topic-4", ownerId: "owner-1", position: 1, transaction }),
		)
		const isCleared = await db.transaction((transaction) =>
			setTopicProfileOrder({ id: "topic-4", ownerId: "owner-1", position: 0, transaction }),
		)

		// both writes ran, and the rows below the old position moved up
		expect([isMoved, isCleared]).toEqual([true, true])
		expect(sentQueries.some(({ text }) => text.includes('"profile_order" = "topics"."profile_order" - 1'))).toBe(true)
	})

	test("a podcast episode's featured items are the featured episodes of its owner's topics", async () => {
		const sentQueries = stubConnectionPool(({ text }) => (text.includes("count(*)") ? [[0]] : [[null]]))
		await db.transaction((transaction) =>
			setPodcastEpisodeProfileOrder({ id: "episode-1", ownerId: "owner-1", position: 1, transaction }),
		)
		expect(sentQueries[1]?.text).toBe(
			'select count(*) from "episodes" where ("episodes"."profile_order" is not null and "episodes"."topic_id" in (select "id" from "topics" where "topics"."owner_id" = $1))',
		)
	})

	test("a film's featured items are the featured films of its owner's topics' podcast episodes, up to twelve", async () => {
		// the film has no order, and its owner has featured none, then twelve
		const sentQueries = stubConnectionPool(({ text }) => (text.includes("count(*)") ? [[0]] : [[null]]))
		const isRanked = await db.transaction((transaction) =>
			setTopicVideoProfileOrder({ id: "film-1", ownerId: "owner-1", position: 1, transaction }),
		)
		expect(isRanked).toBe(true)
		expect(sentQueries[1]?.text).toBe(
			'select count(*) from "topic_videos" where ("topic_videos"."profile_order" is not null and "topic_videos"."episode_id" in (select "id" from "episodes" where "episodes"."topic_id" in (select "id" from "topics" where "topics"."owner_id" = $1)))',
		)
		expect(sentQueries[1]?.values).toEqual(["owner-1"])

		// a thirteenth featured item is rejected and writes nothing
		const fullQueries = stubConnectionPool(({ text }) => (text.includes("count(*)") ? [[12]] : [[null]]))
		const isThirteenthRanked = await db.transaction((transaction) =>
			setTopicVideoProfileOrder({ id: "film-13", ownerId: "owner-1", position: 1, transaction }),
		)
		expect(isThirteenthRanked).toBe(false)
		expect(fullQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
	})

	test("removed podcast episodes release their films' featured items among each owner's featured films", async () => {
		// two featured films of two owners, then each film at position two, and a write returns no row
		const sentQueries = stubConnectionPool(({ text }) => {
			if (text.includes('from "topic_videos" inner join "episodes"')) {
				return [
					["film-1", "owner-1"],
					["film-2", "owner-2"],
				]
			}
			return text.startsWith("select") ? [[2]] : []
		})
		expect(await releaseTopicVideoProfileOrders(["episode-1", "episode-2"], db)).toEqual(["owner-1", "owner-2"])

		// the read takes the featured films of those podcast episodes alone
		expect(sentQueries[0]?.text).toContain('"topic_videos"."episode_id" in ($1, $2)')
		expect(sentQueries[0]?.text).toContain('"topic_videos"."profile_order" is not null')

		// each film is cleared, and the films below it move up inside its own owner's featured items
		const closedGaps = sentQueries.filter(({ text }) => text.includes('"profile_order" - 1'))
		expect(closedGaps.map(({ values }) => values)).toEqual([
			[UPDATED_AT, "owner-1", 2],
			[UPDATED_AT, "owner-2", 2],
		])
	})

	test("a podcast episode whose film is not featured releases nothing", async () => {
		const sentQueries = stubConnectionPool(() => [])
		expect(await releaseTopicVideoProfileOrders(["episode-1"], db)).toEqual([])
		expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
	})

	test("a Topic Post's featured items are the featured Topic Posts of its author, with no limit", async () => {
		// the post has no order, and its author has featured none, then twelve
		const sentQueries = stubConnectionPool(({ text }) => (text.includes("count(*)") ? [[0]] : [[null]]))
		const isRanked = await db.transaction((transaction) =>
			setTopicPostProfileOrder({ id: "post-1", ownerId: "author-1", position: 1, transaction }),
		)
		expect(isRanked).toBe(true)
		expect(sentQueries[1]?.text).toBe(
			'select count(*) from "topic_posts" where ("topic_posts"."profile_order" is not null and "topic_posts"."author_user_id" = $1)',
		)

		// a thirteenth featured item past the end takes the next position
		const thirteenthQueries = stubConnectionPool(({ text }) => (text.includes("count(*)") ? [[12]] : [[null]]))
		const isThirteenthRanked = await db.transaction((transaction) =>
			setTopicPostProfileOrder({ id: "post-13", ownerId: "author-1", position: 20, transaction }),
		)
		expect(isThirteenthRanked).toBe(true)
		const orderWrite = thirteenthQueries.find(({ text }) => text.includes('set "profile_order" = $1'))
		expect(orderWrite?.values[0]).toBe(13)
	})

	test("a deleted Topic Post releases its featured position among its author's featured items", async () => {
		// the post's author, then the post at position two, and a write returns no row
		const sentQueries = stubConnectionPool(({ text }) => {
			if (text.startsWith('select "author_user_id" from "topic_posts"')) {
				return [["author-1"]]
			}
			return text.startsWith("select") ? [[2]] : []
		})
		expect(await releaseTopicPostProfileOrder("post-1", db)).toBe("author-1")

		// the rows below it move up inside that author's featured items alone
		expect(sentQueries.at(-1)?.text).toBe(
			'update "topic_posts" set "profile_order" = "topic_posts"."profile_order" - 1, "updated_at" = $1 where (("topic_posts"."profile_order" is not null and "topic_posts"."author_user_id" = $2) and "topic_posts"."profile_order" > $3)',
		)
		expect(sentQueries.at(-1)?.values).toEqual([UPDATED_AT, "author-1", 2])
	})

	test("a topic leaving the public set releases its own featured position and its podcast episodes', films', and Topic Posts' featured items", async () => {
		// the topic's owner, one featured Topic Post by another author, one featured podcast episode, one featured film, and
		// each row's order
		const sentQueries = stubConnectionPool(({ text }) => {
			if (text.startsWith('select "owner_id" from "topics"')) {
				return [["owner-1"]]
			}
			if (text.startsWith('select "id", "author_user_id" from "topic_posts"')) {
				return [["post-1", "author-2"]]
			}

			// the topic's featured podcast episode, and the featured film of one of its podcast episodes
			if (text.startsWith('select "id" from "episodes"')) {
				return [["episode-1"]]
			}
			if (text.includes('from "topic_videos" inner join "episodes"')) {
				return [["film-1", "owner-1"]]
			}

			// each row holds position two, and a write returns no row
			return text.startsWith("select") ? [[2]] : []
		})

		// the owner's and the author's profiles changed
		expect(await releaseTopicProfileOrders("topic-1", db)).toEqual(["owner-1", "author-2"])

		// each release clears its row and moves the rows below it up
		const clearedTables = sentQueries
			.filter(({ text }) => text.includes('"profile_order" = $1'))
			.map(({ text }) => text.split('"')[1])
		expect(clearedTables).toEqual(["topic_posts", "episodes", "topic_videos", "topics"])

		// the film read takes the featured films of the topic's podcast episodes
		const filmRead = sentQueries.find(({ text }) => text.includes('from "topic_videos" inner join'))
		expect(filmRead?.text).toContain('"episodes"."topic_id" = $1')
		expect(filmRead?.values).toEqual(["topic-1"])
	})

	test("a topic whose only featured item is one of its films still names its owner", async () => {
		// the topic's owner, one featured film at position one, and nothing else featured
		stubConnectionPool(({ text }) => {
			if (text.startsWith('select "owner_id" from "topics"')) {
				return [["owner-1"]]
			}
			if (text.includes('from "topic_videos" inner join "episodes"')) {
				return [["film-1", "owner-1"]]
			}

			// the film's own order, no featured Topic Post or podcast episode, and no order on the topic
			if (text.startsWith('select "profile_order" from "topic_videos"')) {
				return [[1]]
			}
			return text.startsWith('select "id"') ? [] : [[null]]
		})

		// the owner's profile changed
		expect(await releaseTopicProfileOrders("topic-1", db)).toEqual(["owner-1"])
	})

	test("a topic with nothing featured releases nothing", async () => {
		// the topic's owner, no featured Topic Post, no featured podcast episode, no featured film, and no order on the topic
		stubConnectionPool(({ text }) => {
			if (text.startsWith('select "owner_id" from "topics"')) {
				return [["owner-1"]]
			}
			const isFeaturedRowsRead = text.startsWith('select "id"') || text.includes('from "topic_videos"')
			return isFeaturedRowsRead ? [] : [[null]]
		})

		// nothing is released, so no profile changed
		expect(await releaseTopicProfileOrders("topic-1", db)).toEqual([])
	})
})

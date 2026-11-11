// home Topic Post route tests: only an admin reads the lists and pins, only a published post of a public shown topic
// is pinned, and each rejection changes nothing
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import {
	ADMIN_USER_ACCESS_ROW,
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
} from "@carlnotes/db/connectionPoolStub"
import { toSignedInApp } from "../testSession"
import * as homeOrder from "../topic/homeOrder"
import { topicPostHomeOrderRoute } from "./topicPostHomeOrder"

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// what the stubbed reads return: the post's published time, or no post, and whether its topic is public and shown
type StubTopicPostOptions = { publishedAt?: string | null; isMissing?: boolean; isTopicShown?: boolean }

// the rank dialog's two reads: the pinned rows, and the rows a pin may name, which the limit marks
function toRankDialogRows(queryText: string): unknown[][] {
	return queryText.includes("limit")
		? [["post-2", "Pulling shots", "Home espresso"]]
		: [["post-1", "Dialing in", "Home espresso"]]
}

// a read or a write of the home order while no row is pinned: no order, a count of zero, and no row for a write
function toHomeOrderRows(queryText: string): unknown[][] {
	if (!queryText.startsWith("select")) {
		return []
	}
	return [[queryText.includes("count(*)") ? 0 : null]]
}

// stand in for the reads around a pin: each user's access row, the post, its topic, and the pinned rows
function stubTopicPost({
	publishedAt = "2026-11-09 12:00:00+00",
	isMissing = false,
	isTopicShown = true,
}: StubTopicPostOptions = {}): {
	sentQueries: ReturnType<typeof stubConnectionPool>
	clearHomeSpy: ReturnType<typeof spyOn>
} {
	// the post's published time and topic, or no post, and the topic if it is public and shown
	const topicPostRows = isMissing ? [] : [[publishedAt, "topic-1"]]
	const shownTopicRows = isTopicShown ? [["topic-1"]] : []
	const sentQueries = stubConnectionPool(({ text, values }) => {
		// the post's read, then its topic's
		if (text.startsWith('select "published_at", "topic_id" from "topic_posts"')) {
			return topicPostRows
		}
		if (text.startsWith('select "id" from "topics"')) {
			return shownTopicRows
		}

		// the rank dialog's rows, then the home order, then a user's access row
		if (text.includes('inner join "topics"')) {
			return toRankDialogRows(text)
		}
		if (text.includes('"home_order"')) {
			return toHomeOrderRows(text)
		}

		// an admin's access row, or a free user's
		return values.includes("admin-1") ? [ADMIN_USER_ACCESS_ROW] : [FREE_USER_ACCESS_ROW]
	})
	return { sentQueries, clearHomeSpy: spyOn(homeOrder, "clearHomeCaches").mockResolvedValue() }
}

// send a position for the Topic Post as the given user, or as a visitor
function sendTopicPostHomeOrder(userId: string | null, position: number): Response | Promise<Response> {
	const app = userId ? toSignedInApp(topicPostHomeOrderRoute, userId) : topicPostHomeOrderRoute
	return app.request("/topic-posts/post-1/home-order", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ position }),
	})
}

test("an admin pins a published Topic Post of a public shown topic, and the home reads its cards again", async () => {
	const { sentQueries, clearHomeSpy } = stubTopicPost()
	expect((await sendTopicPostHomeOrder("admin-1", 1)).status).toBe(200)
	const orderWrite = sentQueries.find(({ text }) => text.startsWith('update "topic_posts" set "home_order" = $1'))
	expect(orderWrite?.values[0]).toBe(1)
	expect(clearHomeSpy).toHaveBeenCalledTimes(1)
})

test("a visitor is unauthorized and anyone but an admin is forbidden, on the write and on the read", async () => {
	const { sentQueries, clearHomeSpy } = stubTopicPost()
	expect((await sendTopicPostHomeOrder(null, 1)).status).toBe(401)
	expect((await sendTopicPostHomeOrder("user-1", 1)).status).toBe(403)

	// the lists are an admin's alone too
	expect((await topicPostHomeOrderRoute.request("/home/topic-posts")).status).toBe(401)
	expect((await toSignedInApp(topicPostHomeOrderRoute, "user-1").request("/home/topic-posts")).status).toBe(403)
	expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
	expect(clearHomeSpy).not.toHaveBeenCalled()
})

test("a missing post is not found, and a draft and a hidden topic's post are each a conflict", async () => {
	stubTopicPost({ isMissing: true })
	expect((await sendTopicPostHomeOrder("admin-1", 1)).status).toBe(404)

	// a draft has no published time
	const draft = stubTopicPost({ publishedAt: null })
	expect((await sendTopicPostHomeOrder("admin-1", 1)).status).toBe(409)
	expect(draft.sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)

	// a topic that is not public, or has too few findings to list
	const hidden = stubTopicPost({ isTopicShown: false })
	expect((await sendTopicPostHomeOrder("admin-1", 1)).status).toBe(409)
	expect(hidden.sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
})

test("an admin reads the pinned Topic Posts in their order and the newest ones a pin may name", async () => {
	const { sentQueries } = stubTopicPost()
	const response = await toSignedInApp(topicPostHomeOrderRoute, "admin-1").request("/home/topic-posts")
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({
		pinnedTopicPosts: [{ id: "post-1", title: "Dialing in", topicName: "Home espresso" }],
		candidateTopicPosts: [{ id: "post-2", title: "Pulling shots", topicName: "Home espresso" }],
	})

	// the pinned read follows the home order, and the offered read takes published posts newest first
	const listReads = sentQueries.filter(({ text }) => text.includes('inner join "topics"')).map(({ text }) => text)
	expect(listReads.some((text) => text.includes('order by "topic_posts"."home_order" asc'))).toBe(true)
	expect(
		listReads.some(
			(text) =>
				text.includes('"topic_posts"."published_at" is not null') &&
				text.includes('order by "topic_posts"."published_at" desc'),
		),
	).toBe(true)
})

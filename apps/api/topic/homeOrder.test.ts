// home topic route tests: a position the topic already holds changes nothing and keeps its home podcast episodes'
// pins, and a new position moves the topic and clears the home's caches
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { ADMIN_USER_ACCESS_ROW, restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as edgeCache from "../edgeCache"
import { toSignedInApp } from "../testSession"
import * as feedCaches from "./feedCaches"
import { homeOrderRoute } from "./homeOrder"

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// stand in for the reads around a pin: the public topic at the given position, a count of pinned rows, and the
// admin's access row
function stubPinnedTopic(homeOrder: number | null): {
	sentQueries: ReturnType<typeof stubConnectionPool>
	clearFeedCachesSpy: ReturnType<typeof spyOn>
} {
	const sentQueries = stubConnectionPool(({ text }) => {
		// the topic's visibility and position, then the reads of the write
		if (text.startsWith('select "visibility", "feature_order" from "topics"')) {
			return [["public", homeOrder]]
		}
		if (text.includes("count(*)")) {
			return [[3]]
		}

		// the position the write releases, then the admin's access row
		if (text.startsWith('select "feature_order" from "topics"')) {
			return [[homeOrder]]
		}
		return text.includes('from "users"') ? [ADMIN_USER_ACCESS_ROW] : []
	})

	// no cache is cleared and nothing is purged at the edge
	spyOn(edgeCache, "purgeHomeAtEdge").mockResolvedValue(undefined)
	return { sentQueries, clearFeedCachesSpy: spyOn(feedCaches, "clearSharedTopicFeedCaches").mockResolvedValue() }
}

// send a position for the topic as the admin
function sendTopicHomeOrder(position: number): Response | Promise<Response> {
	return toSignedInApp(homeOrderRoute, "admin-1").request("/topics/topic-1/home-order", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ position }),
	})
}

test("saving the position a topic already holds writes nothing and keeps its podcast episodes' pins", async () => {
	const { sentQueries, clearFeedCachesSpy } = stubPinnedTopic(2)
	expect((await sendTopicHomeOrder(2)).status).toBe(200)

	// no read of the topic's pinned podcast episodes, no write, and no cache cleared
	expect(sentQueries.some(({ text }) => text.includes('"episodes"'))).toBe(false)
	expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
	expect(clearFeedCachesSpy).not.toHaveBeenCalled()
})

test("clearing a topic that holds no position writes nothing", async () => {
	const { sentQueries, clearFeedCachesSpy } = stubPinnedTopic(null)
	expect((await sendTopicHomeOrder(0)).status).toBe(200)
	expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
	expect(clearFeedCachesSpy).not.toHaveBeenCalled()
})

test("a new position moves the topic and clears the home's caches", async () => {
	const { sentQueries, clearFeedCachesSpy } = stubPinnedTopic(2)
	expect((await sendTopicHomeOrder(1)).status).toBe(200)

	// the topic leaves its position, then takes the new one
	const orderWrites = sentQueries.filter(({ text }) => text.startsWith('update "topics" set "feature_order" = $1'))
	expect(orderWrites.map(({ values }) => values[0])).toEqual([null, 1])
	expect(clearFeedCachesSpy).toHaveBeenCalledTimes(1)
})

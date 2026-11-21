// a topic image render's row: a start that fails takes the row back, a pending row can be deleted, and a replaced
// image leaves no visitor page that names the old file
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { topicImageRenders } from "@carlnotes/db/schema/topicImages"
import { toVisitorTopicPageKey } from "@carlnotes/db/visitorPageCaches"
import * as edgePurge from "@carlnotes/server/edgePurge"
import * as temporalClient from "../temporalClient"
import * as topicCovers from "./topicCovers"
import { deletePendingTopicImageRender, replaceTopicImage, startTopicImageRender } from "./topicImageRenders"

// put the pool, the Redis client, and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// a row with no workflow would stay pending for good and count as a regeneration
test("a render whose workflow does not start takes its row back and throws the start's error", async () => {
	// the insert returns the row, and the workflow start fails
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith("insert") ? [toTableRow(topicImageRenders, { id: "render-1", topicId: "topic-1" })] : [],
	)
	spyOn(temporalClient, "startTopicImageWorkflow").mockRejectedValue(new Error("temporal is down"))
	const renderStart = startTopicImageRender({ topicId: "topic-1", userId: "user-1", kind: "regenerate", model: "m" })
	await expect(renderStart).rejects.toThrow("temporal is down")

	// the row the insert wrote is deleted by its id
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "topic_image_renders"'))
	expect(deleteQuery?.values).toEqual(["render-1"])
})

test("only a render that is still pending is deleted", async () => {
	const sentQueries = stubConnectionPool(() => [["render-1"]])
	expect(await deletePendingTopicImageRender("render-1")).toBe(true)
	expect(sentQueries[0]?.values).toEqual(["render-1", "pending"])

	// a render that finished meanwhile matches no row
	stubConnectionPool(() => [])
	expect(await deletePendingTopicImageRender("render-1")).toBe(false)
})

// a visitor's copy of the topic page names the image file, which the file route stops serving once it is replaced
test("a replaced image deletes the visitor copy of the topic page, so the next read names the new file", async () => {
	// the topic had an image and is public. the visitor page keys' read finds the topic gone, which keeps its own key
	stubConnectionPool(({ text }) => {
		if (text.includes("array_agg")) {
			return []
		}
		return text.startsWith("select") ? [["old-hash", "public"]] : []
	})

	// a visitor's copy names the old file, and the covers and the edge are stubbed
	const storedValueByKey = stubRedisClient()
	storedValueByKey.set(toVisitorTopicPageKey("topic-1"), JSON.stringify({ imageHash: "old-hash" }))
	spyOn(topicCovers, "forgetTopicCovers").mockResolvedValue(undefined)
	const purgeSpy = spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue(undefined)

	// the new image is the current one, and the copy that named the old one is gone
	await replaceTopicImage({
		topicId: "topic-1",
		renderId: null,
		hash: "new-hash",
		origin: "uploaded",
		scene: null,
		model: null,
		imagePrompt: null,
		width: 1536,
		height: 1024,
		costDollars: 0,
	})
	expect(storedValueByKey.has(toVisitorTopicPageKey("topic-1"))).toBe(false)
	expect(purgeSpy.mock.calls).toEqual([["topic-image:topic-1"]])
})

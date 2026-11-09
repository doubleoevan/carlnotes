// the backfill's listing by mode, public topics first, and the render row it reuses or writes for a topic
import { afterEach, expect, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import {
	listBackfillTopicIds,
	rederiveBackfillTopicImageFiles,
	startBackfillRender,
} from "./backfillTopicImagesActivities"
import * as renderTopicImageActivities from "./renderTopicImageActivities"

// put the pool's own query back after each test
afterEach(() => {
	restoreConnectionPool()
})

test("each mode lists through its own filter, public topics first, one page at a time", async () => {
	const createdAt = "2026-01-01 00:00:00.123456+00"
	const sentQueries = stubConnectionPool(() => [
		["topic-1", createdAt, "public"],
		["topic-2", createdAt, "private"],
	])
	const limit = 10
	const fullPage = { topicIds: ["topic-1", "topic-2"], nextCursor: null }
	expect(await listBackfillTopicIds({ mode: "missing", limit })).toEqual(fullPage)
	expect(await listBackfillTopicIds({ mode: "redo", limit })).toEqual(fullPage)
	expect(await listBackfillTopicIds({ mode: "resize", limit })).toEqual(fullPage)

	// missing wants no image row, redo a generated one, and resize any image row, each ordered public first
	const [missingQuery, redoQuery, resizeQuery] = sentQueries
	expect(missingQuery?.text).toContain('"topic_images"."topic_id" is null')
	expect(redoQuery?.text).toContain('"topic_images"."origin" = $')
	expect(redoQuery?.values).toContain("generated")
	expect(resizeQuery?.text).toContain('"topic_images"."topic_id" is not null')

	// every mode puts the public topics first, then the oldest, then by id, and takes one page
	for (const sentQuery of sentQueries) {
		expect(sentQuery.text).toContain("= 'public' then 0 else 1 end")
		expect(sentQuery.text).toContain('"topics"."created_at" asc, "topics"."id" asc limit $')
	}
})

test("a full page returns the cursor of the next page, which the next listing starts after", async () => {
	// a page as long as the limit
	const createdAt = "2026-01-01 00:00:00.123456+00"
	const sentQueries = stubConnectionPool(() => [
		["topic-1", createdAt, "public"],
		["topic-2", createdAt, "private"],
	])
	const firstPage = await listBackfillTopicIds({ mode: "missing", limit: 2 })
	expect(firstPage.nextCursor).toEqual({ publicRank: 1, createdAt, id: "topic-2" })

	// the next page starts after the cursor
	await listBackfillTopicIds({ mode: "missing", afterTopic: firstPage.nextCursor ?? undefined, limit: 2 })
	expect(sentQueries[1]?.text).toContain(") > (")
	expect(sentQueries[1]?.values).toContain("topic-2")
})

test("a topic's pending backfill row is reused, and a new one is written on no user", async () => {
	// a pending row from an earlier attempt
	stubConnectionPool(({ text }) => (text.startsWith("select") ? [["render-1"]] : []))
	expect(await startBackfillRender({ topicId: "topic-1" })).toEqual({ topicId: "topic-1", renderId: "render-1" })
	restoreConnectionPool()

	// no pending row, so a backfill row is written with no user to bill
	const sentQueries = stubConnectionPool(({ text }) => (text.startsWith("insert") ? [["render-2"]] : []))
	expect(await startBackfillRender({ topicId: "topic-1" })).toEqual({ topicId: "topic-1", renderId: "render-2" })
	const insertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith("insert"))
	expect(insertQuery?.text).toContain('"topic_image_renders"')
	expect(insertQuery?.values).toContain("backfill")
	expect(insertQuery?.values).not.toContain("user-1")
})

test("a resize derives the files again and records a succeeded resize render with no user", async () => {
	// the files are derived once, then the row is written
	const rederiveSpy = spyOn(renderTopicImageActivities, "rederiveTopicImageFiles").mockResolvedValue()
	const sentQueries = stubConnectionPool(() => [])
	await rederiveBackfillTopicImageFiles("topic-1")
	expect(rederiveSpy).toHaveBeenCalledWith("topic-1")
	const insertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith("insert"))
	expect(insertQuery?.text).toContain('"topic_image_renders"')
	expect(insertQuery?.values).toContain("resize")
	expect(insertQuery?.values).toContain("succeeded")
	rederiveSpy.mockRestore()
})

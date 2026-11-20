// a topic image render's row: a start that fails takes the row back, and a pending row can be deleted
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { topicImageRenders } from "@carlnotes/db/schema/topicImages"
import * as temporalClient from "../temporalClient"
import { deletePendingTopicImageRender, startTopicImageRender } from "./topicImageRenders"

afterEach(() => {
	restoreConnectionPool()
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

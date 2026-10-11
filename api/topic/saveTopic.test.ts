// a save that changes a topic's visibility saves its vectors again, and a failed vector save never fails the topic's save
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import * as meanVectors from "../../worker/meanVectors"
import { saveTopicVectorsOnVisibilityChange } from "./saveTopic"

// put every spy back after each test
afterEach(() => {
	mock.restore()
})

test("a save that keeps the visibility saves no vectors", async () => {
	const saveTopicVectorsSpy = spyOn(meanVectors, "saveTopicVectors").mockResolvedValue(true)
	await saveTopicVectorsOnVisibilityChange({ topicId: "topic-1", visibility: "public", previousVisibility: "public" })
	expect(saveTopicVectorsSpy).not.toHaveBeenCalled()
})

test("a save that changes the visibility saves the topic's vectors again", async () => {
	const saveTopicVectorsSpy = spyOn(meanVectors, "saveTopicVectors").mockResolvedValue(false)
	await saveTopicVectorsOnVisibilityChange({ topicId: "topic-1", visibility: "private", previousVisibility: "public" })
	expect(saveTopicVectorsSpy).toHaveBeenCalledWith("topic-1")
})

test("a failed vector save is reported and does not throw", async () => {
	// a vector save that fails, and the report it sends
	spyOn(meanVectors, "saveTopicVectors").mockRejectedValue(new Error("database down"))
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// the save resolves, and the failure is reported with the topic
	await saveTopicVectorsOnVisibilityChange({ topicId: "topic-1", visibility: "public", previousVisibility: "invite" })
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "database", { topicId: "topic-1" })
})

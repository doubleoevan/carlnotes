// a save that changes a topic's visibility saves its vectors again, a failed vector save never fails the topic's save,
// and a save whose unchecked images could not go back to their uploaders writes no visibility
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { UpdateTopicPayload } from "@carlnotes/contracts/topicPayloads"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { topics } from "@carlnotes/db/schema/topics"
import * as meanVectors from "@carlnotes/pipeline/meanVectors"
import * as publishedUncheckedImages from "@carlnotes/pipeline/publishedUncheckedImages"
import * as monitoring from "@carlnotes/server/monitoring"
import * as authorization from "../authorization"
import { saveTopicVectorsOnVisibilityChange, updateTopic } from "./saveTopic"
import * as saveTopicGate from "./saveTopicGate"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the unchecked images go back in the transaction that writes the visibility, before the topic's row is written
test("a save whose unchecked images could not go back writes no visibility", async () => {
	// a private weekly topic, which its owner may edit and whose text passes the gate
	const topicFields = { name: "T", prompt: "P", tags: [], frequency: "weekly", scheduledTime: "09:00:00" } as const
	const privateTopicRow = toTableRow(topics, {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "private",
		...topicFields,
	})
	const sentQueries = stubConnectionPool(({ text }) => (text.includes('from "topics"') ? [privateTopicRow] : []))
	spyOn(authorization, "isAllowed").mockImplementation(async (_userId, capability) => capability !== "topic:invite")
	spyOn(saveTopicGate, "toTopicSaveRejection").mockResolvedValue(null)

	// the step that returns the images fails, and the step after the transaction never runs
	const unpublishTopicUncheckedImagesSpy = spyOn(
		publishedUncheckedImages,
		"unpublishTopicUncheckedImages",
	).mockRejectedValue(new Error("no lock"))
	const redrawSpy = spyOn(publishedUncheckedImages, "redrawUnpublishedImageFiles").mockResolvedValue(undefined)
	const publicTopicEdit: UpdateTopicPayload = {
		...topicFields,
		tags: [],
		scheduledTime: "09:00",
		scheduledDayOfWeek: "monday",
		visibility: "public",
		maxTopicFindings: 10,
		inviteEmails: [],
		sources: [],
	}

	// the save fails with the error, and the topic's row is never written
	const analyticsProperties = { entryPoint: "web", plan: "free" } as never
	const failedSave = updateTopic("owner-1", "topic-1", publicTopicEdit, analyticsProperties)
	await expect(failedSave).rejects.toThrow("no lock")
	expect(unpublishTopicUncheckedImagesSpy.mock.calls[0]?.[1]).toEqual({ topicId: "topic-1", visibility: "public" })
	expect(sentQueries.some(({ text }) => text.startsWith('update "topics"'))).toBe(false)
	expect(redrawSpy).not.toHaveBeenCalled()
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

// topic tool tests for the prompt version write, the settings tool's podcast switch, and a visibility change whose
// unchecked images could not go back to their uploaders
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { topics } from "@carlnotes/db/schema/topics"
import * as publishedUncheckedImages from "@carlnotes/pipeline/publishedUncheckedImages"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import * as authorization from "../authorization"
import { savePromptVersion } from "../topic/promptVersions"
import { toPodcastFieldDescription, toUpdateTopicFieldsShape, updateTopicFields } from "./topicTools"

// the pool's own query and every spy, put back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the unchecked images go back in the transaction that writes the visibility, before the Topic's row is written
test("a visibility change whose unchecked images could not go back writes no visibility", async () => {
	const privateTopicRow = toTableRow(topics, { id: "topic-1", ownerId: "owner-1", name: "T", visibility: "private" })
	const sentQueries = stubConnectionPool(({ text }) => (text.includes('from "topics"') ? [privateTopicRow] : []))
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	const unpublishTopicUncheckedImagesSpy = spyOn(
		publishedUncheckedImages,
		"unpublishTopicUncheckedImages",
	).mockRejectedValue(new Error("no lock"))
	const redrawSpy = spyOn(publishedUncheckedImages, "redrawUnpublishedImageFiles").mockResolvedValue(undefined)

	// the edit fails with the error, and nothing after the failed step runs
	const topicEdit = { userId: "owner-1", topicId: "topic-1", promptVersionOrigin: "chat" } as const
	await expect(updateTopicFields({ ...topicEdit, topicFields: { visibility: "public" } })).rejects.toThrow("no lock")
	expect(unpublishTopicUncheckedImagesSpy.mock.calls[0]?.[1]).toEqual({ topicId: "topic-1", visibility: "public" })
	expect(sentQueries.some(({ text }) => text.startsWith('update "topics"'))).toBe(false)
	expect(redrawSpy).not.toHaveBeenCalled()
})

// an unchanged prompt writes no version, and a changed one does
test("the version write skips an unchanged prompt and saves a changed one", async () => {
	// a fake transaction that keeps every inserted row
	const insertedRows: unknown[] = []
	const transaction = {
		insert: () => ({
			values: async (insertedRow: unknown) => {
				insertedRows.push(insertedRow)
			},
		}),
	} as never

	// save the same text twice
	await savePromptVersion(transaction, {
		topicId: "topic-1",
		prompt: "same",
		userId: "user-1",
		origin: "editor",
		previousPrompt: "same",
	})
	expect(insertedRows).toEqual([])

	// save a changed prompt
	await savePromptVersion(transaction, {
		topicId: "topic-1",
		prompt: "new",
		userId: "user-1",
		origin: "chat",
		previousPrompt: "same",
	})
	expect(insertedRows).toEqual([{ topicId: "topic-1", prompt: "new", savedByUserId: "user-1", origin: "chat" }])
})

// the podcast switch is offered only if episode recording is configured, in the schema and in the description
test("the settings tool offers the podcast switch only if a speech model is configured", () => {
	const restoreEnvSettings = saveEnvSettings(["PODCAST_SPEECH_MODEL"])
	try {
		// with the speech model set empty, the tool has no switch to offer
		Bun.env.PODCAST_SPEECH_MODEL = ""
		expect(Object.keys(toUpdateTopicFieldsShape())).not.toContain("isPodcastEnabled")
		expect(toPodcastFieldDescription()).toBe("")

		// with the default speech model, both adapters get the field and the sentence that describes it
		delete Bun.env.PODCAST_SPEECH_MODEL
		expect(Object.keys(toUpdateTopicFieldsShape())).toContain("isPodcastEnabled")
		expect(toPodcastFieldDescription()).toContain("isPodcastEnabled")
	} finally {
		// put the setting back as the environment had it
		restoreEnvSettings()
	}
})

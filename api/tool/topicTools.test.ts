// topic tool tests for the prompt version write and the settings tool's podcast switch
import { expect, test } from "bun:test"
import { saveEnvSettings } from "@shared/savedEnvSettings"
import { savePromptVersion } from "../topic/promptVersions"
import { toPodcastFieldDescription, toUpdateTopicFieldsShape } from "./topicTools"

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

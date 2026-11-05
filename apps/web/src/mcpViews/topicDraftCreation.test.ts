import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { createTopicPayload, EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import * as host from "./mcpViewHost"
import { createEditedTopicDraft } from "./topicDraftCreation"

const draft = createTopicPayload.parse({
	...EMPTY_TOPIC_DRAFT,
	name: "Moss",
	prompt: "Humidity and ventilation",
	visibility: "private",
})
const preview = { status: "createConfirmRequired" as const, topicId: null, afterTopicDraft: draft, confirmation: "old" }
afterEach(() => mock.restore())

test("edited fields receive a fresh signature before one exact creation", async () => {
	const edited = { ...draft, name: "Moss sensors", prompt: "Compare humidity sensors" }
	const call = spyOn(host, "callMcpViewTool")
		.mockResolvedValueOnce({
			content: [],
			structuredContent: { ...preview, afterTopicDraft: edited, confirmation: "fresh" },
		})
		.mockResolvedValueOnce({
			content: [],
			structuredContent: { status: "created", topicId: "created", afterTopicDraft: edited },
		})
	expect(await createEditedTopicDraft({ preview, draft: edited })).toMatchObject({
		status: "created",
		name: edited.name,
	})
	expect(call.mock.calls).toEqual([
		["create_topic", edited],
		["create_topic", { ...edited, confirmation: "fresh" }],
	])
})

test("a server-changed preview waits for another explicit confirmation", async () => {
	const edited = { ...draft, name: "Moss sensors" }
	const call = spyOn(host, "callMcpViewTool").mockResolvedValue({
		content: [],
		structuredContent: { ...preview, afterTopicDraft: { ...edited, prompt: "Changed" }, confirmation: "fresh" },
	})
	expect(await createEditedTopicDraft({ preview, draft: edited })).toMatchObject({ status: "preview" })
	expect(call).toHaveBeenCalledTimes(1)
	expect(call.mock.calls[0]?.[1]).not.toHaveProperty("confirmation")
})

test("unchanged fields reuse their signature and invalid fields call no tool", async () => {
	const call = spyOn(host, "callMcpViewTool").mockResolvedValue({
		content: [],
		structuredContent: { status: "created", topicId: "created", afterTopicDraft: draft },
	})
	await createEditedTopicDraft({ preview, draft })
	expect(call.mock.calls).toEqual([["create_topic", { ...draft, confirmation: "old" }]])
	call.mockClear()
	expect(await createEditedTopicDraft({ preview, draft: { ...draft, prompt: "" } })).toMatchObject({ status: "failed" })
	expect(call).not.toHaveBeenCalled()
})

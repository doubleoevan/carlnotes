// the proposal a reopened conversation is still sitting on, read back from the tools its chat turns called
import { expect, test } from "bun:test"
import type { ChatToolCall } from "@shared/contracts"
import { toProposedTopicEdit } from "./topicToolCalls"

// one stored tool call, the shape a chat turn keeps and returns on load
function toStoredToolCall(toolName: string, input: unknown): ChatToolCall {
	return { toolName, input, output: "done" }
}

// the newest proposal is the one that still stands, so reopening the conversation previews it again
test("toProposedTopicEdit reads back the last proposal", () => {
	const proposedTopicEdit = toProposedTopicEdit([
		{ toolCalls: [toStoredToolCall("proposeTopicEdit", { frequency: "weekly" })] },
		{ toolCalls: [toStoredToolCall("searchWeb", {})] },
		{ toolCalls: [toStoredToolCall("proposeTopicEdit", { frequency: "daily", tags: ["nba"] })] },
	])
	expect(proposedTopicEdit).toEqual({ frequency: "daily", tags: ["nba"] })
})

// a cancellation after the proposal ends the topic edit
test("toProposedTopicEdit reads a cancelled proposal as none", () => {
	const proposedTopicEdit = toProposedTopicEdit([
		{ toolCalls: [toStoredToolCall("proposeTopicEdit", { frequency: "daily" })] },
		{ toolCalls: [toStoredToolCall("cancelTopicEdit", {})] },
	])
	expect(proposedTopicEdit).toBeNull()
})

// a proposal the user agreed to is written into the topic, so reopening the conversation must not preview it over
// the topic it already changed, which would list every added source twice
test("toProposedTopicEdit reads a saved proposal as none", () => {
	const proposedTopicEdit = toProposedTopicEdit([
		{
			toolCalls: [toStoredToolCall("proposeTopicEdit", { addSources: [{ sourceOption: "youtube", value: "Hoops" }] })],
		},
		{ toolCalls: [toStoredToolCall("addSource", {})] },
	])
	expect(proposedTopicEdit).toBeNull()
})

// a conversation that proposed nothing, and one whose stored proposal no longer parses, both read as none
test("toProposedTopicEdit reads no proposal and an unreadable one as none", () => {
	expect(toProposedTopicEdit([{ toolCalls: [toStoredToolCall("addSource", {})] }, {}])).toBeNull()
	expect(
		toProposedTopicEdit([{ toolCalls: [toStoredToolCall("proposeTopicEdit", { frequency: "hourly" })] }]),
	).toBeNull()
})

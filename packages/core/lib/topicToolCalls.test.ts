import { expect, test } from "bun:test"
import type { ChatToolCall } from "@carlnotes/contracts/payloads"
import { CHAT_REJECTION_COPY, toChatTopicLimitCopy } from "./chatRejectionCopy"
import { applyTopicEditToolCalls, showTopicToolCalls, toProposedTopicEdit } from "./topicToolCalls"

// preview first, then cancel or settle accepted saves through the same callbacks
test("topic edits preview, cancel, and reload only through supplied effects", () => {
	const transitions: unknown[] = []
	const effects = {
		topicId: "topic-1",
		onStartEditingTopic: (...values: unknown[]) => {
			transitions.push(values)
		},
		onClearProposedTopicEdit: () => {
			transitions.push("clear")
		},
	}
	applyTopicEditToolCalls({
		...effects,
		toolCalls: { proposedTopicEdit: { tags: ["news"] }, isTopicEditCancelled: false, topicSaves: [] },
	})
	expect(transitions).toEqual([["topic-1", { tags: ["news"] }]])
	applyTopicEditToolCalls({
		...effects,
		toolCalls: { isTopicEditCancelled: true, topicSaves: [] },
	})
	applyTopicEditToolCalls({
		...effects,
		toolCalls: { isTopicEditCancelled: false, topicSaves: ["Saved."] },
	})
	expect(transitions.slice(1)).toEqual(["clear", "clear", ["topic-1"]])
})

// report every outcome and keep rejected saves from masquerading as accepted edits
test("save notices retain order and rejection styling", () => {
	const notices: string[] = []
	showTopicToolCalls({
		topicToolToasts: { topicSaves: ["Saved tags.", "Added source."], topicSaveRejections: ["Not allowed."] },
		onSaved: (message) => {
			notices.push(`saved:${message}`)
		},
		onRejected: (message) => {
			notices.push(`rejected:${message}`)
		},
	})
	expect(notices).toEqual(["saved:Saved tags.", "saved:Added source.", "rejected:Not allowed."])
	expect(
		toProposedTopicEdit([{ toolCalls: [toStoredToolCall("proposeTopicEdit", { frequency: "invalid" })] }]),
	).toBeNull()
})

// keep the common rejection wording independent of browser pricing actions
test("shared rejection copy contains no pricing action", () => {
	expect(CHAT_REJECTION_COPY.budget).toBe("Carl is staring at an empty mug.")
	expect(CHAT_REJECTION_COPY.rateLimited).toBe("Carl needs a minute to catch up. Ask again shortly.")
	expect(toChatTopicLimitCopy(3)).toBe("Your plan has 3 topics, and you used them all.")
	expect(Object.values(CHAT_REJECTION_COPY).join(" ")).not.toContain("Pick up more coffee")
})

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

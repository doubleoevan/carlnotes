// chat adapter tests for the topic binding and the edit tool text
import { expect, test } from "bun:test"
import {
	toAddTopicSourceText,
	toCancelTopicEditTool,
	toEmptyChatTurnToolCalls,
	toOpenNewTopicChatTool,
	toProposeTopicEditTool,
	toRejectionText,
	toTopicEditPreviewTools,
} from "./chatTools"

// the preview tools bound to one chat turn
const topicEditPreviewTools = toTopicEditPreviewTools({
	toolCalls: toEmptyChatTurnToolCalls(),
})

// no schema takes a topic. a message cannot point a tool at another topic
test("no tool takes a topic argument", () => {
	for (const topicEditPreviewTool of Object.values(topicEditPreviewTools)) {
		const shape = (topicEditPreviewTool.inputSchema as { shape?: Record<string, unknown> }).shape ?? {}
		expect(Object.keys(shape)).not.toContain("topicId")
		expect(Object.keys(shape)).not.toContain("topic_id")
	}
})

// the proposal tool previews the change and saves nothing, so it has no confirmation rule and no save count
test("proposeTopicEdit previews the change without saving or counting as a save", async () => {
	const toolCalls = toEmptyChatTurnToolCalls()
	const proposeTopicEditTool = toProposeTopicEditTool({ toolCalls })
	expect(proposeTopicEditTool.description).toContain("saves nothing and changes nothing")
	expect(proposeTopicEditTool.description).not.toContain("after the reader said yes")
	// the call records what it previewed, and nothing else
	const proposedTopicEdit = { prompt: "Favor video walkthroughs.", frequency: "daily" as const }
	await proposeTopicEditTool.execute?.(proposedTopicEdit, { toolCallId: "call-1", messages: [], context: undefined })
	expect(toolCalls).toEqual({ count: 0, topicSaves: [], topicSaveRejections: [], proposedTopicEdit })
})

// the add source text names the source and its projected cost, and says no scan started
test("the add source text names the source, the cost, and that no brew started", () => {
	const addTopicSourceText = toAddTopicSourceText({
		status: "saved",
		topicSourceId: "source-1",
		topicSourceLabel: "reddit — r/startups",
		topicSourceCostDelta: { perScanCents: 2.5, perMonthCents: 75 },
	})
	expect(addTopicSourceText).toContain("reddit — r/startups")
	expect(addTopicSourceText).toContain("2.5¢")
	expect(addTopicSourceText).toContain("75¢")
	expect(addTopicSourceText).toContain("No brew started")
})

// the other add texts say what stopped the add, and the rejections are plain words
test("the rejections and the other add texts are plain words", () => {
	expect(toAddTopicSourceText({ status: "present", topicSourceLabel: "rss — a.test" })).toContain("already reads")
	expect(toAddTopicSourceText({ status: "limit", limit: 10 })).toContain("10 sources")
	expect(toAddTopicSourceText({ status: "invalid" })).toContain("url, handle, or id")
	expect(toRejectionText("missing")).toContain("not there")
	expect(toRejectionText("forbidden")).toContain("may not change")
})

// the cancel tool takes a preview off the card and saves nothing
test("cancelTopicEdit ends the preview without saving or counting as a save", async () => {
	const toolCalls = toEmptyChatTurnToolCalls()
	const cancelTopicEdit = toCancelTopicEditTool({ toolCalls })
	expect(cancelTopicEdit.description).toContain("saves nothing and changes nothing")
	await cancelTopicEdit.execute?.({}, { toolCallId: "call-1", messages: [], context: undefined })
	expect(toolCalls).toEqual({ count: 0, topicSaves: [], topicSaveRejections: [], isTopicEditCancelled: true })
})

// check that the openNewTopicChat tool opens the chat and leaves the save count alone
test("openNewTopicChat opens the chat without counting as a save", async () => {
	const toolCalls = toEmptyChatTurnToolCalls()
	const openNewTopicChat = toOpenNewTopicChatTool({ toolCalls })
	const toolText = await openNewTopicChat.execute?.({}, { toolCallId: "call-1", messages: [], context: undefined })
	// check the count stays zero
	expect(toolCalls).toEqual({ count: 0, topicSaves: [], topicSaveRejections: [], isNewTopicChatOpened: true })
	expect(toolText).toContain("opening beside this one")
})

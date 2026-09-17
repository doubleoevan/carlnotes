// chat adapter tests for the tool list, the topic binding, the confirmation rule, and the tool text
import { expect, test } from "bun:test"
import { EMPTY_TOPIC_DRAFT, TOPIC_SAVE_TOOL_NAMES, type TopicDraft } from "@shared/contracts"
import { toBrowserPlatform, toPlatform } from "@shared/userAgent"
import {
	type ChatTurnToolCalls,
	toAddTopicSourceText,
	toCancelTopicEditTool,
	toChatTopicTools,
	toCreateTopicReason,
	toCreateTopicText,
	toNewTopicChatTools,
	toOpenNewTopicChatTool,
	toProposeTopicEditTool,
	toRejectionText,
	toSuggestionsText,
} from "./chatTools"

// the tools bound to one topic
const chatTopicTools = toChatTopicTools({
	userId: "user-1",
	topicId: "topic-1",
	toolCalls: { count: 0, topicSaves: [], topicSaveRejections: [] },
})

// exactly the tools that save, under the names the prompt uses. the consent gate reads the same names from shared,
// and a rename that reached only one of the two would let a yes force a tool the gate never meant
test("the adapter offers the topic tools and not the proposal tool", () => {
	expect(Object.keys(chatTopicTools).sort()).toEqual([...TOPIC_SAVE_TOOL_NAMES].sort())
	expect(Object.keys(chatTopicTools).sort()).toEqual([
		"addSource",
		"removeSource",
		"updateTopicFields",
		"updateTopicPrompt",
	])
})

// no schema takes a topic. a message cannot point a tool at another topic
test("no tool takes a topic argument", () => {
	for (const chatTopicTool of Object.values(chatTopicTools)) {
		const shape = (chatTopicTool.inputSchema as { shape?: Record<string, unknown> }).shape ?? {}
		expect(Object.keys(shape)).not.toContain("topicId")
		expect(Object.keys(shape)).not.toContain("topic_id")
	}
})

// every description includes the confirmation rule
test("every tool's description includes the confirmation rule", () => {
	for (const chatTopicTool of Object.values(chatTopicTools)) {
		expect(chatTopicTool.description).toContain("after the reader said yes")
	}
})

// the proposal tool previews the change and saves nothing, so it has no confirmation rule and no save count
test("proposeTopicEdit previews the change without saving or counting as a save", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
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

// the analytics properties a create records, shaped the way the mcp adapter builds them
const analyticsProperties = {
	plan: "free",
	platform: toPlatform(undefined),
	browserPlatform: toBrowserPlatform(""),
	isInAppBrowser: false,
}

// the new-topic chat offers draftTopic and createTopic, and never the suggestion tool
test("the new-topic chat offers draftTopic and createTopic, without the suggestion tool", () => {
	const topicDraft: TopicDraft = { ...EMPTY_TOPIC_DRAFT }
	const newTopicTools = toNewTopicChatTools({
		userId: "user-1",
		toolCalls: { count: 0, topicSaves: [], topicSaveRejections: [] },
		topicDraft,
		analyticsProperties,
	})
	expect(Object.keys(newTopicTools)).toEqual(["draftTopic", "createTopic"])
})

// draftTopic writes the named fields alone, and an empty value clears a field as the description promises
test("draftTopic writes the named fields, leaves the rest, and clears on an empty value", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	const topicDraft: TopicDraft = {
		...EMPTY_TOPIC_DRAFT,
		prompt: "Runs after work",
		sources: [{ sourceOption: "reddit", value: "Sourdough" }],
	}
	const newTopicTools = toNewTopicChatTools({
		userId: "user-1",
		toolCalls,
		topicDraft,
		analyticsProperties,
	})
	await newTopicTools.draftTopic?.execute?.(
		{ name: "Hoops", visibility: "public" },
		{ toolCallId: "call-1", messages: [], context: undefined },
	)
	expect(topicDraft).toEqual({
		...EMPTY_TOPIC_DRAFT,
		name: "Hoops",
		prompt: "Runs after work",
		visibility: "public",
		sources: [{ sourceOption: "reddit", value: "Sourdough" }],
	})
	expect(toolCalls.topicDraft).toEqual(topicDraft)
	expect(toolCalls.count).toBe(1)

	// an empty list clears the sources the call before it left standing
	await newTopicTools.draftTopic?.execute?.({ sources: [] }, { toolCallId: "call-2", messages: [], context: undefined })
	expect(topicDraft.sources).toEqual([])
})

// the cancel tool takes a preview off the card and saves nothing
test("cancelTopicEdit ends the preview without saving or counting as a save", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	const cancelTopicEdit = toCancelTopicEditTool({ toolCalls })
	expect(cancelTopicEdit.description).toContain("saves nothing and changes nothing")
	await cancelTopicEdit.execute?.({}, { toolCallId: "call-1", messages: [], context: undefined })
	expect(toolCalls).toEqual({ count: 0, topicSaves: [], topicSaveRejections: [], isTopicEditCancelled: true })
})

// the create and suggestion text is plain words
test("the create and suggestion text is plain words", () => {
	expect(
		toCreateTopicText({ status: "created", topicId: "topic-1", name: "Hoops", teamName: null, addTeamRejection: null }),
	).toContain("Created Hoops")
	expect(
		toCreateTopicText({
			status: "created",
			topicId: "topic-1",
			name: "Hoops",
			teamName: "Notes of Carl",
			addTeamRejection: null,
		}),
	).toContain("It is on Notes of Carl")
	expect(toCreateTopicText({ status: "incomplete" })).toContain("title and a prompt")
	expect(toCreateTopicText({ status: "inviteeRejected", email: "a@b.co" })).toContain("a@b.co")
	expect(toSuggestionsText({ status: "ok", sources: [{ sourceOption: "reddit", value: "r/hoops" }] })).toContain(
		"- reddit r/hoops",
	)
	expect(toSuggestionsText({ status: "limit" })).toContain("used up")
})

// a rejected create toasts what stopped it, in the reader's own terms
test("a rejected create names what stopped it", () => {
	expect(toCreateTopicReason({ status: "quota" })).toBe("Your plan holds all the topics it allows.")
	expect(toCreateTopicReason({ status: "inviteeRejected", email: "a@b.co" })).toBe("a@b.co doesn't take invites.")
	expect(toCreateTopicReason({ status: "limit", limit: 10 })).toBe("That's more than the 10 sources a topic can have.")
})

// check that the openNewTopicChat tool opens the chat and leaves the save count alone
test("openNewTopicChat opens the chat without counting as a save", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	const openNewTopicChat = toOpenNewTopicChatTool({ toolCalls })
	const toolText = await openNewTopicChat.execute?.({}, { toolCallId: "call-1", messages: [], context: undefined })
	// check the count stays zero
	expect(toolCalls).toEqual({ count: 0, topicSaves: [], topicSaveRejections: [], isNewTopicChatOpened: true })
	expect(toolText).toContain("opening beside this one")
})

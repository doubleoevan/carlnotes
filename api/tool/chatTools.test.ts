// chat adapter tests for the tool list, the topic binding, the confirmation rule, and the tool text
import { expect, test } from "bun:test"
import type { TopicDraft } from "@shared/contracts"
import { toBrowserPlatform, toPlatform } from "@shared/userAgent"
import {
	type ChatTurnToolCalls,
	toAddTopicSourceText,
	toChatTopicTools,
	toCreateTopicReason,
	toCreateTopicText,
	toNewTopicChatTools,
	toRejectionText,
	toSuggestionsText,
} from "./chatTools"

// the three tools bound to one topic
const chatTopicTools = toChatTopicTools({
	userId: "user-1",
	topicId: "topic-1",
	toolCalls: { count: 0, topicSaves: [], topicSaveRejections: [] },
})

// exactly the three tools, under the names the prompt uses
test("the adapter offers the three topic tools", () => {
	expect(Object.keys(chatTopicTools).sort()).toEqual(["addSource", "removeSource", "updateTopicPrompt"])
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

// the new-topic chat's tools are the draft, the suggestions, and the create
test("the new-topic tools are the draft, the suggestions, and the create", () => {
	const topicDraft: TopicDraft = { name: "", prompt: "", sources: [], inviteEmails: [], visibility: "invite" }
	const newTopicTools = toNewTopicChatTools({
		userId: "user-1",
		toolCalls: { count: 0, topicSaves: [], topicSaveRejections: [] },
		topicDraft,
		analyticsProperties,
	})
	expect(Object.keys(newTopicTools)).toEqual(["draftTopic", "suggestSources", "createTopic"])
})

// draftTopic writes the named fields alone and saves the whole topic draft for the card
test("draftTopic writes the named fields and leaves the rest", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	const topicDraft: TopicDraft = {
		name: "",
		prompt: "Runs after work",
		sources: [],
		inviteEmails: [],
		visibility: "invite",
	}
	const newTopicTools = toNewTopicChatTools({
		userId: "user-1",
		toolCalls,
		topicDraft: topicDraft,
		analyticsProperties,
	})
	await newTopicTools.draftTopic?.execute?.(
		{ name: "Hoops", visibility: "public" },
		{ toolCallId: "call-1", messages: [], context: undefined },
	)
	expect(topicDraft).toEqual({
		name: "Hoops",
		prompt: "Runs after work",
		sources: [],
		inviteEmails: [],
		visibility: "public",
	})
	expect(toolCalls.topicDraft).toEqual(topicDraft)
	expect(toolCalls.count).toBe(1)
})

// the create and suggestion text is plain words
test("the create and suggestion text is plain words", () => {
	expect(toCreateTopicText({ status: "created", topicId: "topic-1", name: "Hoops" })).toContain("Created Hoops")
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
	expect(toCreateTopicReason({ status: "limit", limit: 10 })).toBe("That's more than the 10sources a topic can have.")
})

// reply stream tests: the text and each tool call are written as they arrive, and no tool call is written twice
import { expect, test } from "bun:test"
import { type ChatToolCall, EMPTY_TOPIC_DRAFT, toChatReplyLineText } from "@shared/contracts"
import type { ChatReplyPart } from "../../worker"
import type { ChatTurnToolCalls } from "../tool/chatTools"
import { writeReplyStream } from "./replyStream"

// one tool-result reply part
function toToolResultPart(toolName: string): ChatReplyPart {
	return { type: "tool-result", toolCall: { toolName, input: {}, output: "done" } }
}

// the same call the api client reads out of a tool calls line
function toSentToolCall(toolName: string): ChatToolCall {
	return { toolName, input: {}, output: "done" }
}

// the tool calls go out the moment each tool returns, before the text that follows
test("writeReplyStream sends a tool's result the moment it returns, before the closing text", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	// a stream whose tool result arrives between two text parts
	async function* replyParts(): AsyncGenerator<ChatReplyPart> {
		yield { type: "text", text: "Writing it. " }
		toolCalls.count += 1
		toolCalls.topicDraft = { ...EMPTY_TOPIC_DRAFT, name: "Hoops" }
		yield toToolResultPart("draftTopic")
		yield { type: "text", text: "Done." }
	}
	// what reached the stream, in order
	const writtenChunks: string[] = []
	await writeReplyStream({ write: async (text) => writtenChunks.push(text) }, { replyParts: replyParts() }, toolCalls)
	expect(writtenChunks).toEqual([
		toChatReplyLineText({ type: "text", text: "Writing it. " }),
		toChatReplyLineText({
			type: "toolCalls",
			toolCalls: {
				topicSaves: [],
				topicSaveRejections: [],
				topicDraft: toolCalls.topicDraft,
				chatToolCalls: [toSentToolCall("draftTopic")],
			},
		}),
		toChatReplyLineText({ type: "text", text: "Done." }),
	])
})

// each save goes out with the tool call that made it
test("writeReplyStream sends each save once and every tool call once", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	async function* replyParts(): AsyncGenerator<ChatReplyPart> {
		toolCalls.topicSaves.push("Carl added reddit — r/hoops.")
		yield toToolResultPart("addSource")
		yield toToolResultPart("searchWeb")
		// a second save lands before the closing text, so it goes out with its own line
		toolCalls.topicSaves.push("Carl saved the new prompt.")
		yield toToolResultPart("updateTopicPrompt")
		yield { type: "text", text: "Both done." }
	}
	const writtenChunks: string[] = []
	await writeReplyStream({ write: async (text) => writtenChunks.push(text) }, { replyParts: replyParts() }, toolCalls)
	expect(writtenChunks).toEqual([
		toChatReplyLineText({
			type: "toolCalls",
			toolCalls: {
				topicSaves: ["Carl added reddit — r/hoops."],
				topicSaveRejections: [],
				chatToolCalls: [toSentToolCall("addSource")],
			},
		}),
		toChatReplyLineText({
			type: "toolCalls",
			toolCalls: { topicSaves: [], topicSaveRejections: [], chatToolCalls: [toSentToolCall("searchWeb")] },
		}),
		toChatReplyLineText({
			type: "toolCalls",
			toolCalls: {
				topicSaves: ["Carl saved the new prompt."],
				topicSaveRejections: [],
				chatToolCalls: [toSentToolCall("updateTopicPrompt")],
			},
		}),
		toChatReplyLineText({ type: "text", text: "Both done." }),
	])
})

// a save made while the tool calls are being written goes out with the next ones
test("writeReplyStream keeps a save made during a write for the next write", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	async function* replyParts(): AsyncGenerator<ChatReplyPart> {
		toolCalls.topicSaves.push("Carl added reddit — r/hoops.")
		yield toToolResultPart("addSource")
		yield toToolResultPart("addSource")
	}
	// add a second tool's save during the first write
	const writtenChunks: string[] = []
	await writeReplyStream(
		{
			write: async (text) => {
				writtenChunks.push(text)
				if (writtenChunks.length === 1) {
					toolCalls.topicSaves.push("Carl added youtube — Hoops Tonight.")
				}
			},
		},
		{ replyParts: replyParts() },
		toolCalls,
	)
	expect(writtenChunks).toEqual([
		toChatReplyLineText({
			type: "toolCalls",
			toolCalls: {
				topicSaves: ["Carl added reddit — r/hoops."],
				topicSaveRejections: [],
				chatToolCalls: [toSentToolCall("addSource")],
			},
		}),
		toChatReplyLineText({
			type: "toolCalls",
			toolCalls: {
				topicSaves: ["Carl added youtube — Hoops Tonight."],
				topicSaveRejections: [],
				chatToolCalls: [toSentToolCall("addSource")],
			},
		}),
	])
})

// isNewTopicChatOpened goes out once, with the tool calls after the tool that set it
test("writeReplyStream sends isNewTopicChatOpened once", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	async function* replyParts(): AsyncGenerator<ChatReplyPart> {
		toolCalls.isNewTopicChatOpened = true
		yield toToolResultPart("openNewTopicChat")
		// the closing text and a later search follow, and neither opens the chat a second time
		yield { type: "text", text: "Continue there." }
		yield toToolResultPart("searchWeb")
	}
	const writtenChunks: string[] = []
	await writeReplyStream({ write: async (text) => writtenChunks.push(text) }, { replyParts: replyParts() }, toolCalls)
	expect(writtenChunks).toEqual([
		toChatReplyLineText({
			type: "toolCalls",
			toolCalls: {
				topicSaves: [],
				topicSaveRejections: [],
				isNewTopicChatOpened: true,
				chatToolCalls: [toSentToolCall("openNewTopicChat")],
			},
		}),
		toChatReplyLineText({ type: "text", text: "Continue there." }),
		toChatReplyLineText({
			type: "toolCalls",
			toolCalls: { topicSaves: [], topicSaveRejections: [], chatToolCalls: [toSentToolCall("searchWeb")] },
		}),
	])
})

// a stream in which no tool did anything ends with no tool calls
test("writeReplyStream writes no tool calls when the tools did nothing", async () => {
	async function* replyParts(): AsyncGenerator<ChatReplyPart> {
		yield { type: "text", text: "Just words." }
	}
	const writtenChunks: string[] = []
	await writeReplyStream(
		{ write: async (text) => writtenChunks.push(text) },
		{ replyParts: replyParts() },
		{ count: 0, topicSaves: [], topicSaveRejections: [] },
	)
	expect(writtenChunks).toEqual([toChatReplyLineText({ type: "text", text: "Just words." })])
})

// chat turn tests: what a turn costs, which turns keep their text, and how their tool calls go out on the stream and into the row
import { expect, test } from "bun:test"
import { type ChatToolCall, EMPTY_TOPIC_DRAFT, toChatReplyLineText } from "@shared/contracts"
import type { ChatReplyPart } from "../../worker"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "../../worker/budget"
import type { ChatTurnToolCalls } from "../tool/chatTools"
import { decryptChatText } from "./encryption"
import { toChatTurnRow, writeReplyStream } from "./turns"

// a stored column's decrypted text
function toDecryptedText(storedText: string | null | undefined): string | null {
	return storedText ? decryptChatText(storedText) : null
}

// one tool-result reply part
function toToolResultPart(toolName: string): ChatReplyPart {
	return { type: "tool-result", toolCall: { toolName, input: {}, output: "done" } }
}

// the same call the api client reads out of a tool calls line
function toSentToolCall(toolName: string): ChatToolCall {
	return { toolName, input: {}, output: "done" }
}

// a persisted chat turn stores what was said, so a signed-in user can reload the page and find their conversation
test("a persisted chat turn keeps its question and answer", () => {
	const chatTurnRow = toChatTurnRow("user-1", "topic-1", 1000, 0, true, "who is hiring?", "four of them are")
	expect(toDecryptedText(chatTurnRow.question)).toBe("who is hiring?")
	expect(toDecryptedText(chatTurnRow.answer)).toBe("four of them are")
	expect(chatTurnRow.userId).toBe("user-1")
})

// a chat turn that does not get persisted still writes a row for the spend to reach the monthly meter
test("a chat turn that does not persist records its cost with no text", () => {
	const chatTurnRow = toChatTurnRow("user-1", "topic-1", 1000, 0, false, "who is hiring?", "four of them are")
	expect(chatTurnRow.question).toBeNull()
	expect(chatTurnRow.answer).toBeNull()
	expect(Number(chatTurnRow.cost)).toBeGreaterThan(0)
})

// the cost is the same best-effort token total that a scan uses, so one rate change moves both
test("a chat turn's cost is the chat rate applied to its tokens", () => {
	const chatTurnRow = toChatTurnRow("user-1", "topic-1", 1_000_000, 0, false, "q", "a")
	expect(Number(chatTurnRow.cost)).toBeCloseTo(tokenCost(1_000_000, CHAT_COST_PER_MILLION_TOKENS), 6)
})

// a web-enabled chat turn's searches are billed onto the same row, so the monthly meter adds what Exa cost
test("a chat turn's web searches add their cost to the row", () => {
	const chatTurnRow = toChatTurnRow("user-1", "topic-1", 0, 2, false, "q", "a")
	expect(Number(chatTurnRow.cost)).toBeCloseTo(2 * EXA_COST_PER_SEARCH, 6)
})

// a chat turn that streamed and then failed still spent tokens, so a zero-token turn is the only free one
test("a zero-token chat turn with no searches costs nothing", () => {
	const chatTurnRow = toChatTurnRow("user-1", "topic-1", 0, 0, false, "q", "")
	expect(Number(chatTurnRow.cost)).toBe(0)
})

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

// a chat turn stores its tool calls as the json the next chat turn replays, and stores none when it called none
test("a chat turn's tool calls are stored with its text and left out when there are none", () => {
	const toolCalls = [{ toolName: "draftTopic", input: { name: "Hoops" }, output: "The draft now reads: Hoops" }]
	const chatTurnRowWithToolCalls = toChatTurnRow(
		"user-1",
		"topic-1",
		100,
		0,
		true,
		"add reddit",
		"Saved.",
		undefined,
		toolCalls,
	)
	expect(toDecryptedText(chatTurnRowWithToolCalls.toolCalls)).toBe(JSON.stringify(toolCalls))
	const chatTurnRowWithoutToolCalls = toChatTurnRow("user-1", "topic-1", 100, 0, true, "hello", "Hi.", undefined, [])
	expect(chatTurnRowWithoutToolCalls.toolCalls).toBeNull()
	// expect no tool calls on a chat turn the gate does not persist either
	const unpersistedChatTurnRow = toChatTurnRow(
		"user-1",
		"topic-1",
		100,
		0,
		false,
		"add reddit",
		"Saved.",
		undefined,
		toolCalls,
	)
	expect(unpersistedChatTurnRow.toolCalls).toBeNull()
})

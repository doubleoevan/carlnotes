// chat turn metering tests. what a chat turn costs and which chat turns keep their text
import { expect, test } from "bun:test"
import { CHAT_TOOL_CALLS_MARKER } from "@shared/contracts"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "../../worker/budget"
import type { ChatTurnToolCalls } from "../tool/chatTools"
import { toChatTurnRow, writeReplyStream } from "./turns"

// a persisted chat turn stores what was said, so a signed-in user can reload the page and find their conversation
test("a persisted chat turn keeps its question and answer", () => {
	const chatTurnRow = toChatTurnRow("user-1", "topic-1", 1000, 0, true, "who is hiring?", "four of them are")
	expect(chatTurnRow.question).toBe("who is hiring?")
	expect(chatTurnRow.answer).toBe("four of them are")
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

// the tool calls are read after the reply streams, not at its start
test("writeReplyStream ends with the tool calls made during the stream", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	// a stream whose second chunk runs a tool, the way a tool step runs before the closing text
	async function* textStream(): AsyncGenerator<string> {
		yield "Writing it. "
		toolCalls.count += 1
		toolCalls.topicDraft = { name: "Hoops", prompt: "", sources: [], inviteEmails: [], visibility: "invite" }
		yield "Done."
	}
	// what reached the stream, in order
	const writtenChunks: string[] = []
	await writeReplyStream({ write: async (text) => writtenChunks.push(text) }, { textStream: textStream() }, toolCalls)
	expect(writtenChunks.slice(0, 2)).toEqual(["Writing it. ", "Done."])
	expect(writtenChunks[2]).toBe(
		`${CHAT_TOOL_CALLS_MARKER}${JSON.stringify({ topicSaves: [], topicSaveRejections: [], topicDraft: toolCalls.topicDraft })}`,
	)
})

// a stream in which no tool did anything ends with no tool calls
test("writeReplyStream writes no tool calls when the tools did nothing", async () => {
	async function* textStream(): AsyncGenerator<string> {
		yield "Just words."
	}
	const writtenChunks: string[] = []
	await writeReplyStream(
		{ write: async (text) => writtenChunks.push(text) },
		{ textStream: textStream() },
		{ count: 0, topicSaves: [], topicSaveRejections: [] },
	)
	expect(writtenChunks).toEqual(["Just words."])
})

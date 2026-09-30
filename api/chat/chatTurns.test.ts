// chat turn row tests: what a chat turn costs, which chat turns keep their text, and how their tool calls go into the row
import { expect, test } from "bun:test"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "../../worker/budget"
import { type ToChatTurnRowOptions, toChatTurnRow } from "./chatTurns"
import { decryptChatText } from "./encryption"

// a stored column's decrypted text
function toDecryptedText(storedText: string | null | undefined): string | null {
	return storedText ? decryptChatText(storedText) : null
}

// a topic chat turn's row, persisted with a question and an answer unless the case says otherwise
function toTopicChatTurnRow(chatTurnRowOptions: Partial<ToChatTurnRowOptions>): ReturnType<typeof toChatTurnRow> {
	return toChatTurnRow({
		userId: "user-1",
		page: { topicId: "topic-1" },
		totalTokens: 1000,
		searchCount: 0,
		isPersisted: true,
		question: "who is hiring?",
		answer: "four of them are",
		toolCalls: [],
		...chatTurnRowOptions,
	})
}

// a persisted chat turn stores what was said, so a signed-in user can reload the page and find their conversation
test("a persisted chat turn keeps its question and answer", () => {
	const chatTurnRow = toTopicChatTurnRow({})
	expect(toDecryptedText(chatTurnRow.question)).toBe("who is hiring?")
	expect(toDecryptedText(chatTurnRow.answer)).toBe("four of them are")
	expect(chatTurnRow.userId).toBe("user-1")
})

// a chat turn that does not get persisted still writes a row for the spend to reach the monthly meter
test("a chat turn that does not persist records its cost with no text", () => {
	const chatTurnRow = toTopicChatTurnRow({ isPersisted: false })
	expect(chatTurnRow.question).toBeNull()
	expect(chatTurnRow.answer).toBeNull()
	expect(Number(chatTurnRow.cost)).toBeGreaterThan(0)
})

// the cost is the chat rate applied to the token total, through the same tokenCost that a scan uses
test("a chat turn's cost is the chat rate applied to its tokens", () => {
	const chatTurnRow = toTopicChatTurnRow({ totalTokens: 1_000_000, isPersisted: false })
	expect(Number(chatTurnRow.cost)).toBeCloseTo(tokenCost(1_000_000, CHAT_COST_PER_MILLION_TOKENS), 6)
})

// a chat turn's row saves its token total beside the cost, as a chat room turn's row does
test("a chat turn's row records its token total", () => {
	const chatTurnRow = toTopicChatTurnRow({ totalTokens: 1234, isPersisted: false })
	expect(chatTurnRow.totalTokens).toBe(1234)
})

// a web-enabled chat turn's searches are billed onto the same row, so the monthly meter adds what Exa cost
test("a chat turn's web searches add their cost to the row", () => {
	const chatTurnRow = toTopicChatTurnRow({ totalTokens: 0, searchCount: 2, isPersisted: false })
	expect(Number(chatTurnRow.cost)).toBeCloseTo(2 * EXA_COST_PER_SEARCH, 6)
})

// a chat turn that streamed and then failed still spent tokens, so a zero-token chat turn is the only free one
test("a zero-token chat turn with no searches costs nothing", () => {
	const chatTurnRow = toTopicChatTurnRow({ totalTokens: 0, isPersisted: false, answer: "" })
	expect(Number(chatTurnRow.cost)).toBe(0)
})

// a chat turn stores its tool calls as json that the next chat turn replays, and stores none if it called none
test("a chat turn's tool calls are stored with its text and left out when there are none", () => {
	const toolCalls = [{ toolName: "draftTopic", input: { name: "Hoops" }, output: "The draft now reads: Hoops" }]
	const chatTurnRowWithToolCalls = toTopicChatTurnRow({ question: "add reddit", answer: "Saved.", toolCalls })
	expect(toDecryptedText(chatTurnRowWithToolCalls.toolCalls)).toBe(JSON.stringify(toolCalls))
	const chatTurnRowWithoutToolCalls = toTopicChatTurnRow({ question: "hello", answer: "Hi." })
	expect(chatTurnRowWithoutToolCalls.toolCalls).toBeNull()
	// expect no tool calls on a chat turn that the gate does not persist either
	const unpersistedChatTurnRow = toTopicChatTurnRow({
		isPersisted: false,
		question: "add reddit",
		answer: "Saved.",
		toolCalls,
	})
	expect(unpersistedChatTurnRow.toolCalls).toBeNull()
})

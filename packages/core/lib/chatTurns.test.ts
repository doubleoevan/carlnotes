import { expect, test } from "bun:test"
import { toChatHistoryTurns } from "./chatHistoryTurns"
import { toFinishedChatTurns, toSentChatTurn } from "./chatTurns"

// preserve partial answers and accepted tools when a generation stops
test("stopping preserves partial text and tool-only turns in the next history", () => {
	const emptyChatTurn = toSentChatTurn({ question: "change the schedule", attachments: [] })
	const toolCalls = [{ toolName: "updateTopicFields", input: { frequency: "weekly" }, output: "Saved." }]
	const partialChatTurn = { ...emptyChatTurn, answer: "Here is", spokenAnswerKey: "partial" }
	const toolChatTurn = { ...emptyChatTurn, toolCalls, spokenAnswerKey: "tools" }
	const stoppedChatTurns = toFinishedChatTurns([partialChatTurn, toolChatTurn], {
		spokenAnswerKey: "tools",
		chatSendResult: "stopped",
	})
	expect(stoppedChatTurns[1]?.rejection).toBeNull()
	expect(toChatHistoryTurns(stoppedChatTurns)).toEqual([
		{ question: emptyChatTurn.question, answer: "Here is", toolCalls: undefined },
		{ question: emptyChatTurn.question, answer: "", toolCalls },
	])
})

// discard an empty stopped turn and omit rejected turns from future requests
test("empty and rejected turns never enter the next request's history", () => {
	const emptyChatTurn = toSentChatTurn({ question: "hello", attachments: [] })
	const stoppedChatTurns = toFinishedChatTurns([emptyChatTurn], {
		spokenAnswerKey: emptyChatTurn.spokenAnswerKey,
		chatSendResult: "stopped",
	})
	expect(stoppedChatTurns).toEqual([])
	const rejectedChatTurns = toFinishedChatTurns([{ ...emptyChatTurn, answer: "Partial" }], {
		spokenAnswerKey: emptyChatTurn.spokenAnswerKey,
		chatSendResult: "failed",
	})
	expect(toChatHistoryTurns(rejectedChatTurns)).toEqual([])
})

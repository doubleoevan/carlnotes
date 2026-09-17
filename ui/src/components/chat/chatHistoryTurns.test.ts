// what the next question sends as the conversation so far
import { expect, test } from "bun:test"
import type { ChatTurn } from "./ChatMessages"
import { toChatHistoryTurns } from "./chatHistoryTurns"

// a chat turn with nothing attached and no links
const EMPTY_CHAT_TURN: ChatTurn = {
	question: "",
	answer: "",
	rejection: null,
	attachments: [],
	linkPreviews: [],
	answerLinkPreviews: [],
}

// send the tools a chat turn called along with its words, or the model reads its own "Saved." but saves nothing
test("a chat turn sends the tools it called", () => {
	const toolCalls = [{ toolName: "updateTopicFields", input: { tags: ["nba"] }, output: "Saved the tags." }]
	const chatHistoryTurns = toChatHistoryTurns([
		{ ...EMPTY_CHAT_TURN, question: "tag it nba", answer: "Saved.", toolCalls },
	])
	expect(chatHistoryTurns).toEqual([{ question: "tag it nba", answer: "Saved.", toolCalls }])
})

// keep a chat turn that saved something but wrote no words, or its call never replays
test("a chat turn with tool calls and no words is kept", () => {
	const toolCalls = [{ toolName: "addSource", input: { value: "r/hoops" }, output: "Added." }]
	const chatHistoryTurns = toChatHistoryTurns([{ ...EMPTY_CHAT_TURN, question: "add r/hoops", answer: "", toolCalls }])
	expect(chatHistoryTurns).toEqual([{ question: "add r/hoops", answer: "", toolCalls }])
})

// leave out a rejected chat turn and one still streaming
test("a rejected chat turn and an empty answer are left out", () => {
	const chatHistoryTurns = toChatHistoryTurns([
		{ ...EMPTY_CHAT_TURN, question: "who is hiring?", answer: "four of them are" },
		{ ...EMPTY_CHAT_TURN, question: "and again", answer: "", rejection: "budget" },
		{ ...EMPTY_CHAT_TURN, question: "streaming now", answer: "" },
	])
	expect(chatHistoryTurns).toEqual([{ question: "who is hiring?", answer: "four of them are", toolCalls: undefined }])
})

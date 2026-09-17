import type { ChatToolCall } from "@shared/contracts"
import type { ChatTurn } from "@/components/chat/ChatMessages"

// one chat turn as the next question sends it
type ChatHistoryTurn = { question: string; answer: string; toolCalls?: ChatToolCall[] }

// whether a chat turn called any tool
function hasToolCalls(chatTurn: ChatTurn): boolean {
	return (chatTurn.toolCalls?.length ?? 0) > 0
}

/**
 * The conversation so far as the next question sends it, minus the rejected chat turns and any with neither an answer nor tool calls.
 * Each chat turn sends the tools it called as well as its words, so the model reads its own save as a call it made
 * instead of only a claim it wrote.
 */
export function toChatHistoryTurns(chatTurns: ChatTurn[]): ChatHistoryTurn[] {
	return chatTurns
		.filter((chatTurn) => chatTurn.rejection === null && (chatTurn.answer !== "" || hasToolCalls(chatTurn)))
		.map((chatTurn) => ({ question: chatTurn.question, answer: chatTurn.answer, toolCalls: chatTurn.toolCalls }))
}

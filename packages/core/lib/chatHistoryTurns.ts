import type { ChatHistoryTurn } from "@carlnotes/contracts/payloads"
import type { ChatTurn } from "./chatTurns"

/**
 * Returns answered and tool-only chat turns for the next request.
 */
export function toChatHistoryTurns(chatTurns: ChatTurn[]): ChatHistoryTurn[] {
	return chatTurns
		.filter((chatTurn) => chatTurn.rejection === null && (chatTurn.answer !== "" || hasToolCalls(chatTurn)))
		.map((chatTurn) => ({ question: chatTurn.question, answer: chatTurn.answer, toolCalls: chatTurn.toolCalls }))
}

// whether a chat turn called any tool
function hasToolCalls(chatTurn: ChatTurn): boolean {
	return (chatTurn.toolCalls?.length ?? 0) > 0
}

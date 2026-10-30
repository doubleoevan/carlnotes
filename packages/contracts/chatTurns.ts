// the chat turn contracts: the model's memory, reply lines, and tool calls
import type { z } from "zod"
import { CHAT_HISTORY_ANSWER_CHARS, CHAT_HISTORY_TOOL_CALL_INPUT_CHARS, CHAT_HISTORY_TOOL_CALLS } from "./chat"
import type { ChatToolCall } from "./payloads"
import type { chatReplyLine, roomTopicToolCalls, topicToolCalls } from "./routeShapes"

// how much conversation the model holds word for word. a character budget, about twenty typical chat turns
export const CHAT_MEMORY_CHARS = 40_000

/**
 * Returns where the uncompacted chat turns start, walking back from the latest turn until the character budget runs
 * out.
 */
export function toUncompactedChatTurnStart(history: { question: string; answer: string }[]): number {
	// spend the budget latest-first
	let budget = CHAT_MEMORY_CHARS
	for (let index = history.length - 1; index >= 0; index--) {
		const chatTurn = history[index]
		budget -= (chatTurn?.question.length ?? 0) + (chatTurn?.answer.length ?? 0)

		// the chat turn that overdraws the budget is the first compacted one, unless it is the latest
		if (budget < 0) {
			return Math.min(index + 1, history.length - 1)
		}
	}
	return 0
}

// how many chat turns a send posts to the llm. the earlier turns beyond the memory budget are compacted
export const CHAT_HISTORY_TURNS = 100

// what one line of a chat reply stream says. JSON escapes every newline the model writes, and model text never passes
// for another line. a question asked from the podcast player gets the speaker who answers it before any text
export type ChatReplyLine = z.infer<typeof chatReplyLine>

/**
 * Returns one line's text, as the chat reply stream sends it.
 */
export function toChatReplyLineText(chatReplyLine: ChatReplyLine): string {
	return `${JSON.stringify(chatReplyLine)}\n`
}

// what the topic tools leave after a chat turn: the toast lines, the topic draft, the topic a create made, whether the
// new-topic chat opened, what carl proposed changing this turn, whether the user turned the proposal down, and the
// tool calls sent back as history
export type TopicToolCalls = z.infer<typeof topicToolCalls>

// the toast lines the topic tools leave: one per save and one per rejected change
export type TopicToolToasts = Pick<TopicToolCalls, "topicSaves" | "topicSaveRejections">

// what a chat room shows every member: the toast lines, and who carl proposed a change to. the proposal names its user,
// so one member asking never moves another member's panel
export type RoomTopicToolCalls = z.infer<typeof roomTopicToolCalls>

// how much of a compacted earlier answer survives
const COMPACT_ANSWER_CHARS = 280

/**
 * Returns an earlier answer compacted to its opening characters.
 */
export function compactChatAnswer(answer: string): string {
	if (answer.length <= COMPACT_ANSWER_CHARS) {
		return answer
	}
	return `${answer.slice(0, COMPACT_ANSWER_CHARS).trimEnd()}…`
}

/**
 * Returns a stored tool call clipped to what the chat turn payload accepts.
 */
export function toSentToolCall(toolCall: ChatToolCall): ChatToolCall {
	// clip an output past its limit, and drop an input past its own. the output still says what the call did
	const isInputSendable = JSON.stringify(toolCall.input ?? null).length <= CHAT_HISTORY_TOOL_CALL_INPUT_CHARS
	const isOutputSendable = toolCall.output.length <= CHAT_HISTORY_ANSWER_CHARS
	if (isInputSendable && isOutputSendable) {
		return toolCall
	}
	return {
		toolName: toolCall.toolName,
		input: isInputSendable ? toolCall.input : null,
		output: isOutputSendable
			? toolCall.output
			: `${toolCall.output.slice(0, CHAT_HISTORY_ANSWER_CHARS - 1).trimEnd()}…`,
	}
}

/**
 * Returns one chat turn's tool calls as the next question sends them, keeping the newest if a turn called more than
 * the payload accepts.
 */
export function toSentToolCalls(toolCalls: ChatToolCall[]): ChatToolCall[] {
	return toolCalls.slice(-CHAT_HISTORY_TOOL_CALLS).map(toSentToolCall)
}

// the tools carl calls to put a change on the topic's card or to take it back off, and the ones that save
export const PROPOSE_TOPIC_EDIT_TOOL = "proposeTopicEdit"

export const CANCEL_TOPIC_EDIT_TOOL = "cancelTopicEdit"

// the tool carl calls in the new-topic chat to propose creating the topic from the draft
export const PROPOSE_NEW_TOPIC_TOOL = "proposeNewTopic"

export const TOPIC_SAVE_TOOL_NAMES = ["updateTopicPrompt", "addSource", "removeSource", "updateTopicFields"]

/**
 * Returns the proposal a conversation is still sitting on, read from the tools its chat turns called, or null for
 * none. A proposal stands until carl cancels it or a tool saves.
 */
export function toStandingTopicEditCall(toolCalls: ChatToolCall[]): ChatToolCall | null {
	// the last call that opened a proposal or closed one, by cancelling it or by saving
	const lastTopicEditCall = toolCalls
		.filter(
			(toolCall) =>
				toolCall.toolName === PROPOSE_TOPIC_EDIT_TOOL ||
				toolCall.toolName === CANCEL_TOPIC_EDIT_TOOL ||
				TOPIC_SAVE_TOOL_NAMES.includes(toolCall.toolName),
		)
		.at(-1)
	return lastTopicEditCall?.toolName === PROPOSE_TOPIC_EDIT_TOOL ? lastTopicEditCall : null
}

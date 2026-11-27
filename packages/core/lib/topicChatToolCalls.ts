// what a private chat turn does with the tool calls its reply streams: keep them on the chat turn, toast each save
// and rejection, preview or clear a topic edit, fill the topic draft card, and open what the reply asks for

import type { TopicToolCalls } from "@carlnotes/contracts/chatTurns"
import type { TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { clearProposedTopicEdit, publishTopicChanged, startEditingTopic } from "../stores/chatConversationStore"
import { type ChatTurn, replaceChatTurn } from "./chatTurns"
import { applyTopicEditToolCalls, showTopicToolCalls } from "./topicToolCalls"

// the chat turn the tool calls arrived on, the calls, and the topic the chat is on
type ApplyTopicChatToolCallsOptions = {
	spokenAnswerKey: string
	toolCalls: TopicToolCalls
	topicId?: string
	// the conversation's setters, the app's notice, and what the reply asks to open
	setChatTurns: (update: (previousChatTurns: ChatTurn[]) => ChatTurn[]) => void
	setTopicDraft: (topicDraft: TopicDraft) => void
	onNotice: (message: string) => void
	onNewTopicChatOpened: () => void
	onTopicCreated: (createdTopicId: string) => void
}

/**
 * Applies one streamed tool calls line: the chat tool calls stay on the chat turn, so the model reads a save as a
 * call, the toasts show, the topic edit and the draft card update, and a created topic opens. Any other save reloads
 * the topic page behind the panel.
 */
export function applyTopicChatToolCalls({
	spokenAnswerKey,
	toolCalls,
	topicId,
	setChatTurns,
	setTopicDraft,
	onNotice,
	onNewTopicChatOpened,
	onTopicCreated,
}: ApplyTopicChatToolCallsOptions): void {
	// keep the chat tool calls on the chat turn
	const streamedChatToolCalls = toolCalls.chatToolCalls
	if (streamedChatToolCalls) {
		setChatTurns((previousChatTurns) =>
			replaceChatTurn(previousChatTurns, spokenAnswerKey, (chatTurn) => ({
				...chatTurn,
				toolCalls: [...(chatTurn.toolCalls ?? []), ...streamedChatToolCalls],
			})),
		)
	}

	// toast the saves and rejections, and preview or clear a topic edit
	showTopicToolCalls({ topicToolToasts: toolCalls, onSaved: onNotice, onRejected: onNotice })
	if (topicId) {
		applyTopicEditToolCalls({
			topicId,
			toolCalls,
			onStartEditingTopic: startEditingTopic,
			onClearProposedTopicEdit: clearProposedTopicEdit,
		})
	}

	// fill the card with the topic draft carl wrote, and remember to open the new-topic chat once the reply ends
	if (toolCalls.topicDraft) {
		setTopicDraft(toolCalls.topicDraft)
	}
	if (toolCalls.isNewTopicChatOpened) {
		onNewTopicChatOpened()
	}

	// open a created topic, or reload the topic page behind the panel, so a save shows there too
	if (toolCalls.createdTopicId) {
		onTopicCreated(toolCalls.createdTopicId)
		return
	}
	if (topicId) {
		publishTopicChanged(topicId)
	}
}

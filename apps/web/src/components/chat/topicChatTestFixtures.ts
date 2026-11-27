// the private chat a web composer test or story writes into: loaded, allowed to chat, nothing typed, voice off, and no
// suggested reply, with each case stating what differs

import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import type { ReceivedSuggestedReply } from "@carlnotes/core/hooks/useTopicChat"
import type { TopicChat } from "./useTopicChat"

// the stream's suggestion: its text, the chat turn it followed, and whether that conversation is still on screen
type TestReceivedSuggestedReplyOptions = { text?: string; spokenAnswerKey?: string; isCurrent?: boolean }

/**
 * Returns a suggestion the stream sent for a chat turn, "Weekly is fine" for chat-turn-1 unless the case says
 * otherwise.
 */
export function toTestReceivedSuggestedReply({
	text = "Weekly is fine",
	spokenAnswerKey = "chat-turn-1",
	isCurrent = true,
}: TestReceivedSuggestedReplyOptions = {}): ReceivedSuggestedReply {
	return { spokenAnswerKey, text, isCurrentChat: () => isCurrent }
}

/**
 * Returns a loaded private chat with the given fields replaced.
 */
export function toTestTopicChat(overrides: Partial<TopicChat> = {}): TopicChat {
	return {
		// the conversation and the empty draft
		chatTurns: [],
		question: "",
		setQuestion: () => {},
		attachments: [],
		addAttachmentFiles: async () => [],
		addPastedText: () => {},
		removeAttachment: () => {},
		keptAttachments: [],
		removeKeptAttachment: async () => {},
		// the gates a loaded conversation resolves
		canChat: true,
		isSignupRequired: false,
		isBudgetExhausted: false,
		canEditTopic: false,
		isFirstTopic: false,
		topicsRemaining: null,
		topicLimit: null,
		isVoiceChatConfigured: false,
		isSuggestedReplyOn: false,
		isLoaded: true,
		// the topic draft, the stream, and the actions
		editableTopicDraft: null,
		topicDraft: EMPTY_TOPIC_DRAFT,
		topicDraftAttachmentFiles: [],
		removeTopicDraftAttachmentFile: () => {},
		isStreaming: false,
		receivedSuggestedReply: null,
		voiceChatPage: null,
		send: async () => {},
		stop: () => {},
		clear: async () => true,
		...overrides,
	}
}

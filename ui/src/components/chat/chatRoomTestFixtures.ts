// the chat fixtures for the ui tests: a chat room message, a loaded chat room, and a finished chat turn
import type { ChatRoomMessage } from "@shared/contracts/chat"
import type { ChatTurn } from "@/components/chat/chatTurns"
import { type ChatRoomState, FIRST_ITEM_INDEX_START } from "@/components/chat/useChatRoom"

/**
 * Returns a member's chat room message with the fields that the chat message list reads, with any of them replaced.
 */
export function toTestChatRoomMessage(chatRoomMessageFields: Partial<ChatRoomMessage> = {}): ChatRoomMessage {
	return {
		id: 1,
		authorUserId: "member-1",
		authorUsername: "ana",
		authorAvatarSource: null,
		authorAvatarVersion: null,
		replyToChatMessageId: null,
		content: "hello room",
		createdAt: "2026-08-18T12:00:00.000Z",
		isSpoken: false,
		attachments: [],
		linkPreviews: [],
		...chatRoomMessageFields,
	}
}

/**
 * Returns a loaded chat room with voice off and no chat messages, with any of its fields replaced.
 */
export function toTestChatRoomState(chatRoomStateFields: Partial<ChatRoomState> = {}): ChatRoomState {
	return {
		chatMessages: [],
		isLoaded: true,
		isRejected: false,
		voiceChatPage: null,
		rejection: null,
		clearRejection: () => {},
		showBudgetRejection: () => {},
		isMessageLoading: false,
		postChatMessage: async () => true,
		loadEarlierChatMessages: async () => 0,
		hasEarlierChatMessages: false,
		firstItemIndex: FIRST_ITEM_INDEX_START,
		reloadChatMessages: async () => {},
		loadingChatMessageIds: new Set<number>(),
		...chatRoomStateFields,
	}
}

/**
 * Returns a finished, typed chat turn with nothing attached and no links, with any of its fields replaced.
 */
export function toTestChatTurn(chatTurnFields: Partial<ChatTurn> = {}): ChatTurn {
	return {
		question: "what is this",
		answer: "a latte",
		rejection: null,
		spokenAnswerKey: "chat-turn-1",
		attachments: [],
		linkPreviews: [],
		answerLinkPreviews: [],
		...chatTurnFields,
	}
}

import type { ChatRoomMessage } from "@carlnotes/contracts/chat"

/**
 * Indexes replies to earlier messages, omitting replies to the row directly above.
 */
export function toChatMessageQuotes(chatMessages: ChatRoomMessage[]): Map<number, ChatRoomMessage> {
	// index loaded chat messages and their quoted replies
	const chatMessagesById = new Map(chatMessages.map((chatMessage) => [chatMessage.id, chatMessage]))
	const quotedChatMessagesByReplyId = new Map<number, ChatRoomMessage>()
	for (const [index, chatMessage] of chatMessages.entries()) {
		const repliedChatMessageId = chatMessage.replyToChatMessageId
		if (repliedChatMessageId === null || repliedChatMessageId === chatMessages[index - 1]?.id) {
			continue
		}
		const repliedChatMessage = chatMessagesById.get(repliedChatMessageId)
		if (repliedChatMessage) {
			quotedChatMessagesByReplyId.set(chatMessage.id, repliedChatMessage)
		}
	}
	return quotedChatMessagesByReplyId
}

/**
 * Merges replayed and earlier chat messages while retaining refreshed metadata.
 */
export function mergeChatRoomMessages(
	knownChatMessages: ChatRoomMessage[],
	incomingChatMessages: ChatRoomMessage[],
): ChatRoomMessage[] {
	// a replay cannot replace metadata loaded since its original delivery
	const chatMessagesById = new Map(incomingChatMessages.map((chatMessage) => [chatMessage.id, chatMessage]))
	for (const chatMessage of knownChatMessages) {
		chatMessagesById.set(chatMessage.id, chatMessage)
	}
	return [...chatMessagesById.values()].sort((first, second) => first.id - second.id)
}

/**
 * Counts distinct earlier chat messages for the virtual list index.
 */
export function countEarlierChatMessages(
	knownChatMessages: ChatRoomMessage[],
	incomingChatMessages: ChatRoomMessage[],
): number {
	const earliestChatMessageId = knownChatMessages[0]?.id ?? Number.POSITIVE_INFINITY
	return new Set(
		incomingChatMessages
			.filter((chatMessage) => chatMessage.id < earliestChatMessageId)
			.map((chatMessage) => chatMessage.id),
	).size
}

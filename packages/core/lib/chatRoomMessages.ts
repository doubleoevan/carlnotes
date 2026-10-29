import type { ChatRoomMessage } from "@carlnotes/contracts/chat"

/**
 * Indexes replies to earlier messages, omitting replies to the row directly above. A reply whose quoted message sits
 * in the loaded range but not in the list, one the user reported, by someone they blocked, or deleted, maps to null,
 * which the bubble shows as a hidden quote. A reply to a message older than the loaded range is left out.
 */
export function toChatMessageQuotes(chatMessages: ChatRoomMessage[]): Map<number, ChatRoomMessage | null> {
	// index loaded chat messages and their quoted replies
	const chatMessagesById = new Map(chatMessages.map((chatMessage) => [chatMessage.id, chatMessage]))
	const oldestChatMessageId = chatMessages[0]?.id ?? 0
	const quotedChatMessagesByReplyId = new Map<number, ChatRoomMessage | null>()
	for (const [index, chatMessage] of chatMessages.entries()) {
		const repliedChatMessageId = chatMessage.replyToChatMessageId
		if (repliedChatMessageId === null || repliedChatMessageId === chatMessages[index - 1]?.id) {
			continue
		}

		// the quoted message, or null for one hidden from the user inside the loaded range
		const repliedChatMessage = chatMessagesById.get(repliedChatMessageId)
		const isHidden = repliedChatMessageId >= oldestChatMessageId && repliedChatMessageId < chatMessage.id
		if (repliedChatMessage || isHidden) {
			quotedChatMessagesByReplyId.set(chatMessage.id, repliedChatMessage ?? null)
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

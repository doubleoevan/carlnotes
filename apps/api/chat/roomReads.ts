// the chat room reads: one page of a chat room's messages for a member, less the ones the member reported or blocked,
// with the cursor that reads the page above
import type { ChatRoomMessagePage } from "@carlnotes/contracts/chat"
import { isVoiceChatConfigured } from "@carlnotes/server/voiceChat"
import { loadChatRoom } from "./roomAccess"
import { toChatMessageIdParam } from "./roomEvents"
import { CHAT_ROOM_LOAD_LIMIT, loadChatRoomMessages } from "./roomMessages"
import { toVisibleChatRoomMessages } from "./roomVisibility"

/**
 * Returns the chat message id a backward page starts reading below, or undefined for the latest page.
 */
export function toBeforeChatMessageId(beforeParam: string | undefined): number | undefined {
	return toChatMessageIdParam(beforeParam) || undefined
}

/**
 * Returns one page of chat messages, whether another sits above it, and whether voice chat is on.
 */
export function toChatMessagePage(
	chatMessages: ChatRoomMessagePage["chatMessages"],
	// how many rows the page loaded before the user's own filter, which decides whether earlier rows exist
	loadedCount = chatMessages.length,
): ChatRoomMessagePage {
	return {
		chatMessages,
		hasEarlierChatMessages: loadedCount === CHAT_ROOM_LOAD_LIMIT,
		isVoiceChatConfigured: isVoiceChatConfigured(),
	}
}

/**
 * Loads one page of a chat room's messages for a member: the latest page with no cursor, or the page above the cursor's
 * chat message. A chat room the user may not read returns null. A topic id of null is the team's own chat room.
 */
export async function loadChatRoomMessagePage({
	userId,
	topicId,
	teamId,
	beforeChatMessageId,
}: {
	userId: string | null
	topicId: string | null
	teamId: string
	beforeChatMessageId: number | undefined
}): Promise<ChatRoomMessagePage | null> {
	// members only
	const chatRoom = await loadChatRoom(userId, topicId, teamId)
	if (!userId || !chatRoom) {
		return null
	}

	// the page, less the chat messages this member reported or blocked
	const chatMessages = await loadChatRoomMessages(topicId, chatRoom.teamId, 0, beforeChatMessageId)
	return toChatMessagePage(await toVisibleChatRoomMessages(userId, chatMessages), chatMessages.length)
}

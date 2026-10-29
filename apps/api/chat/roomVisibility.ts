// which of a chat room's loaded messages one user sees: not the ones they reported, and not the ones by people they
// blocked. the room's messages load once for every user, so the user's own filter runs after the load
import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import { loadReportedSubjectIds } from "../report/reports"
import { loadBlockedUserIds } from "../userBlocks"

/**
 * Returns the messages a user sees from a loaded batch, leaving out their reported messages and their blocked
 * people's. A reply to a hidden message keeps its reply marker.
 */
export async function toVisibleChatRoomMessages(
	userId: string,
	chatMessages: ChatRoomMessage[],
	// the user's blocked people if the caller holds them, which saves the read
	knownBlockedUserIds?: Set<string>,
): Promise<ChatRoomMessage[]> {
	if (chatMessages.length === 0) {
		return chatMessages
	}

	// the user's reported message ids among this batch, and the people they blocked
	const [reportedChatMessageIds, blockedUserIds] = await Promise.all([
		loadReportedSubjectIds(
			userId,
			"chatMessage",
			chatMessages.map((chatMessage) => String(chatMessage.id)),
		),
		knownBlockedUserIds ?? loadBlockedUserIds(userId),
	])
	if (reportedChatMessageIds.size === 0 && blockedUserIds.size === 0) {
		return chatMessages
	}

	// keep what the user has not hidden
	return toUnblockedChatRoomMessages(
		chatMessages.filter((chatMessage) => !reportedChatMessageIds.has(String(chatMessage.id))),
		blockedUserIds,
	)
}

/**
 * Returns the messages not written by the user's blocked people.
 */
export function toUnblockedChatRoomMessages(
	chatMessages: ChatRoomMessage[],
	blockedUserIds: Set<string>,
): ChatRoomMessage[] {
	if (blockedUserIds.size === 0) {
		return chatMessages
	}
	return chatMessages.filter(
		(chatMessage) => chatMessage.authorUserId === null || !blockedUserIds.has(chatMessage.authorUserId),
	)
}

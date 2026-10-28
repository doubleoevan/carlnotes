import { sendDeleteChatRoomMessage } from "@carlnotes/client/chatRoomClient"
import { toCurrentChatGuard } from "../stores/chatConversationStore"
import { DELETE_CHAT_MESSAGE_COPY } from "./chatCopy"

// the confirmed deletion and its platform-owned effects
type DeleteChatRoomMessageOptions = {
	topicId: string | null
	teamId: string
	chatMessageId: number
	onReload: () => Promise<void>
	onNotice: (message: string) => void
}

/**
 * Deletes a confirmed room message and refreshes history only after server acceptance.
 */
export async function deleteChatRoomMessage({
	topicId,
	teamId,
	chatMessageId,
	onReload,
	onNotice,
}: DeleteChatRoomMessageOptions): Promise<void> {
	// ignore delayed results after the account or conversation changes
	const isCurrentChat = toCurrentChatGuard()
	const isDeleted = await sendDeleteChatRoomMessage(topicId, teamId, chatMessageId).catch(() => false)
	if (!isCurrentChat()) {
		return
	}
	if (!isDeleted) {
		onNotice(DELETE_CHAT_MESSAGE_COPY.failed)
		return
	}

	// refresh history after the server accepts the deletion
	try {
		await onReload()
	} catch {
		// a failed refresh leaves the accepted deletion successful
	}
	if (isCurrentChat()) {
		onNotice(DELETE_CHAT_MESSAGE_COPY.succeeded)
	}
}

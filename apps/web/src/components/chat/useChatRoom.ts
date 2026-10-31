import { type ChatRoomState, useChatRoom as useSharedChatRoom } from "@carlnotes/core/hooks/useChatRoom"
import { toast } from "sonner"
import { useChatRoomStream } from "./useChatRoomStream"

export {
	type ChatRoomPost,
	type ChatRoomRejection,
	type ChatRoomState,
	FIRST_ITEM_INDEX_START,
} from "@carlnotes/core/hooks/useChatRoom"

/**
 * Adds browser streaming and toasts to shared room state.
 */
export function useChatRoom({
	topicId,
	teamId,
	userId,
}: {
	topicId: string | null
	teamId: string
	userId: string | undefined
}): ChatRoomState {
	return useSharedChatRoom({ topicId, teamId, userId, useStream: useChatRoomStream, onNotice: toast })
}

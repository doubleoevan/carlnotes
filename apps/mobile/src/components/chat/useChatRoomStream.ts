import { toApiUrl } from "@carlnotes/client/apiClient"
import { useChatRoomStream as useSharedChatRoomStream } from "@carlnotes/core/hooks/useChatRoomStream"
import type { ChatRoomHandlers, ConnectChatRoomEvents } from "@carlnotes/core/lib/chatRoomStream"
import { toCurrentChatGuard } from "@carlnotes/core/stores/chatConversationStore"
import { openChatRoomEvents } from "@/chatRoomEvents"
import { useIsScreenActive } from "@/hooks/useIsScreenActive"
import { mobileApiRequestSettings } from "@/mobileApiRequestSettings"

/**
 * Keeps one authenticated native room stream while this screen is active.
 */
export function useChatRoomStream(topicId: string | null, teamId: string, handlers: ChatRoomHandlers): void {
	const isActive = useIsScreenActive()
	useSharedChatRoomStream({ topicId, teamId, handlers, connectEvents, isActive })
}

// read current session headers for each connection
const connectEvents: ConnectChatRoomEvents = async (path, events) => {
	const isCurrentChat = toCurrentChatGuard()
	const headers = await mobileApiRequestSettings.headers()
	if (!isCurrentChat()) {
		throw new Error("chat changed before connecting")
	}
	return openChatRoomEvents({
		url: toApiUrl(path),
		headers,
		events,
		isCurrent: isCurrentChat,
		onUnauthorized: mobileApiRequestSettings.onUnauthorized,
	})
}

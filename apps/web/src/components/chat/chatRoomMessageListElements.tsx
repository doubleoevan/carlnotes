import type { ChatRoomMessageListElements } from "@carlnotes/core/components/ChatRoomMessageList"
import { ModelThinkingBubble } from "./ChatMessageParts"

/**
 * Scrolls the plain list up to a chat message's row, which a reply's quote names.
 */
export function scrollToPlainListChatMessage(chatMessageId: number): void {
	document.getElementById(toChatMessageRowId(chatMessageId))?.scrollIntoView({ behavior: "smooth", block: "center" })
}

// the plain list's rows, which a reply's quote scrolls to by id, the empty room's line, and the thinking shimmer
export const CHAT_ROOM_MESSAGE_LIST_ELEMENTS: ChatRoomMessageListElements = {
	Item: ({ chatMessageId, children }) => <div id={toChatMessageRowId(chatMessageId)}>{children}</div>,
	EmptyLine: ({ children }) => <p className="text-muted-foreground px-1 py-6 text-center text-sm">{children}</p>,
	ThinkingBubble: ModelThinkingBubble,
}

// the element id of a chat message's row in the plain list
function toChatMessageRowId(chatMessageId: number): string {
	return `room-message-${chatMessageId}`
}

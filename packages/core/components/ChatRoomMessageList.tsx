import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import { type ComponentType, type ReactNode, useCallback, useMemo } from "react"
import { useNow } from "../hooks/useNow"
import { toEmptyChatRoomCopy } from "../lib/chatCopy"
import { toChatMessageQuotes } from "../lib/chatRoomMessages"
import type { ChatRoomMessageBubbleProps } from "./ChatRoomMessageBubble"

// what each chat bubble reads from the list: its quote, whose message it is, whether the user may delete it, and the
// clock its time label reads
export type ChatRoomListBubbleProps = Pick<
	ChatRoomMessageBubbleProps,
	"chatMessage" | "repliedChatMessage" | "isOwnChatMessage" | "canDelete" | "now"
>

export type ChatRoomMessageListElements = {
	// one chat message's row, which a reply's quote scrolls to by its id
	Item: ComponentType<{ chatMessageId: number; children: ReactNode }>
	EmptyLine: ComponentType<{ children: string }>
	ThinkingBubble: ComponentType
}

/**
 * Returns each chat bubble's list props: the quote it replies to, whether it is the user's own, whether the user may
 * delete it, and one clock for every time label, ticking by the minute.
 */
export function useChatRoomListBubbleProps({
	chatMessages,
	userId,
	canModerate,
}: {
	chatMessages: ChatRoomMessage[]
	userId: string | null
	// a team leader and an admin may delete any message, everyone else only their own
	canModerate: boolean
}): (chatMessage: ChatRoomMessage) => ChatRoomListBubbleProps {
	// one lookup table from chat message id, so a reply reference costs no scan per bubble
	const chatMessageQuotes = useMemo(() => toChatMessageQuotes(chatMessages), [chatMessages])
	const now = useNow()
	return useCallback(
		(chatMessage) => {
			const isOwnChatMessage = userId !== null && chatMessage.authorUserId === userId
			return {
				chatMessage,
				repliedChatMessage: chatMessageQuotes.get(chatMessage.id),
				isOwnChatMessage,
				canDelete: isOwnChatMessage || canModerate,
				now,
			}
		},
		[chatMessageQuotes, userId, canModerate, now],
	)
}

/**
 * Lists a chat room's messages oldest first, the empty room's line while it has none, and Carl's thinking bubble
 * while he writes a reply.
 */
export function ChatRoomMessageList({
	chatMessages,
	userId,
	canModerate,
	chatName,
	isMessageLoading,
	renderChatMessage,
	elements: { Item, EmptyLine, ThinkingBubble },
}: {
	chatMessages: ChatRoomMessage[]
	userId: string | null
	canModerate: boolean
	// the room's name, which the empty room's line names
	chatName: string
	isMessageLoading: boolean
	// the app's chat bubble with its handlers, around the list's props
	renderChatMessage: (bubbleProps: ChatRoomListBubbleProps) => ReactNode
	elements: ChatRoomMessageListElements
}) {
	const toBubbleProps = useChatRoomListBubbleProps({ chatMessages, userId, canModerate })
	return (
		<>
			{chatMessages.length === 0 && <EmptyLine>{toEmptyChatRoomCopy(chatName)}</EmptyLine>}
			{chatMessages.map((chatMessage) => (
				<Item key={chatMessage.id} chatMessageId={chatMessage.id}>
					{renderChatMessage(toBubbleProps(chatMessage))}
				</Item>
			))}
			{isMessageLoading && <ThinkingBubble />}
		</>
	)
}

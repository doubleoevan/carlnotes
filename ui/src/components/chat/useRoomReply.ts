// which chat message the chat room composer is replying to
import type { ChatRoomMessage } from "@shared/contracts"
import { useEffect, useState } from "react"
import type { ChatRoomState } from "@/components/chat/useChatRoom"

// the reply selection the chat message list and the composer share
export type ChatRoomReply = {
	replyTo: ChatRoomMessage | null
	// whether the reply chat message was auto-selected instead of tapped on a chat message
	isAutoReply: boolean
	// each other author's latest chat message, newest first, for the composer's reply to menu
	replyChatMessages: { username: string; chatMessage: ChatRoomMessage }[]
	// tapping a chat message selects it, and sending clears the selection
	selectChatMessage: (chatMessage: ChatRoomMessage) => void
	clear: () => void
}

/**
 * The room's reply selection. Carl or a member answering this user auto-selects their chat message so the
 * exchange keeps going, and tapping any chat message overrides that until the user sends.
 */
export function useRoomReply(chatRoom: ChatRoomState, userId: string | undefined): ChatRoomReply {
	const [replyTo, setReplyTo] = useState<ChatRoomMessage | null>(null)
	const [isAutoReply, setIsAutoReply] = useState(false)

	// a tapped reply chat message that someone deleted is gone from the room. the composer stops naming it
	useEffect(() => {
		if (!chatRoom.isLoaded || replyTo === null) {
			return
		}
		if (!chatRoom.chatMessages.some((chatMessage) => chatMessage.id === replyTo.id)) {
			setReplyTo(null)
		}
	}, [chatRoom.isLoaded, chatRoom.chatMessages, replyTo])

	// the auto-selected reply chat message keeps an exchange going
	useEffect(() => {
		if (!chatRoom.isLoaded || !userId || (replyTo !== null && !isAutoReply)) {
			return
		}
		// the newest answerable chat message auto-selects
		const replyChatMessage = toReplyChatMessage(chatRoom.chatMessages, userId)
		if (replyChatMessage && replyChatMessage.id !== replyTo?.id) {
			setReplyTo(replyChatMessage)
			setIsAutoReply(true)
			return
		}
		// anything else clears the auto-selected reply chat message. the menu reads @all again
		if (!replyChatMessage && replyTo !== null && isAutoReply) {
			setReplyTo(null)
		}
	}, [chatRoom.isLoaded, chatRoom.chatMessages, userId, replyTo, isAutoReply])

	// each other author's latest chat message, newest first, for the composer's reply to menu
	const latestChatMessageByUsername = new Map<string, ChatRoomMessage>()
	for (const chatMessage of chatRoom.chatMessages) {
		if (chatMessage.authorUserId !== userId) {
			latestChatMessageByUsername.set(chatMessage.authorUsername, chatMessage)
		}
	}
	// newest speaker first, which is the order the reply picker offers them in
	const replyChatMessages = [...latestChatMessageByUsername.values()]
		.reverse()
		.map((chatMessage) => ({ username: chatMessage.authorUsername, chatMessage }))
	return {
		replyTo,
		isAutoReply,
		replyChatMessages,
		// a tapped chat message is the user's own choice. it outranks whatever was auto-selected
		selectChatMessage: (chatMessage) => {
			setReplyTo(chatMessage)
			setIsAutoReply(false)
		},
		clear: () => setReplyTo(null),
	}
}

// the newest chat message to reply to. null for anything else
function toReplyChatMessage(chatMessages: ChatRoomMessage[], userId: string): ChatRoomMessage | null {
	const newestChatMessage = chatMessages.at(-1)
	if (
		!newestChatMessage ||
		newestChatMessage.authorUserId === userId ||
		newestChatMessage.replyToChatMessageId === null
	) {
		return null
	}
	const isAnsweringUser = chatMessages.some(
		(chatMessage) => chatMessage.id === newestChatMessage.replyToChatMessageId && chatMessage.authorUserId === userId,
	)
	return isAnsweringUser ? newestChatMessage : null
}

import { useEffect, useRef } from "react"
import { type ChatRoomHandlers, type ConnectChatRoomEvents, openChatRoomStream } from "../lib/chatRoomStream"
import { toCurrentChatGuard, useChatConversation } from "../stores/chatConversationStore"

export type UseChatRoomStream = (topicId: string | null, teamId: string, handlers: ChatRoomHandlers) => void

/**
 * Keeps the stream's state shared while each app supplies its transport and foreground lifetime.
 */
export function useChatRoomStream({
	topicId,
	teamId,
	handlers,
	connectEvents,
	isActive = true,
}: {
	topicId: string | null
	teamId: string
	handlers: ChatRoomHandlers
	connectEvents: ConnectChatRoomEvents
	isActive?: boolean
}): void {
	// callbacks follow renders without reopening the connection
	const handlersRef = useRef(handlers)
	handlersRef.current = handlers
	const { accountId } = useChatConversation()
	// biome-ignore lint/correctness/useExhaustiveDependencies: an account replacement retires the stream even for identical room ids
	useEffect(() => {
		if (!isActive) {
			return
		}
		const isCurrentChat = toCurrentChatGuard()
		return openChatRoomStream({
			topicId,
			teamId,
			connectEvents,
			handlers: {
				onChatMessagesLoaded: (page) => {
					if (isCurrentChat()) {
						handlersRef.current.onChatMessagesLoaded(page)
					}
				},
				onChatMessage: (message) => {
					if (isCurrentChat()) {
						handlersRef.current.onChatMessage(message)
					}
				},
				onTopicToolCalls: (roomTopicToolCalls) => {
					if (isCurrentChat()) {
						handlersRef.current.onTopicToolCalls(roomTopicToolCalls)
					}
				},
				onLoadFailed: () => {
					if (isCurrentChat()) {
						handlersRef.current.onLoadFailed?.()
					}
				},
				onLoadUnreadable: (reload) => {
					if (isCurrentChat()) {
						handlersRef.current.onLoadUnreadable?.(reload)
					}
				},
			},
		})
	}, [topicId, teamId, connectEvents, isActive, accountId])
}

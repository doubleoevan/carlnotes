// the chat room's live stream: opening it, resuming past the cursor, and reconnecting when it drops
import type { ChatRoomMessage } from "@shared/contracts"
import { useEffect, useRef } from "react"
import { fetchChatRoomMessages, toChatRoomEventsUrl } from "@/clients/chatRoomClient"
import { STALE_STREAM_MS, toReconnectStreamDelayMs } from "@/lib/streamReconnect"

/**
 * Load a chat room's chat messages once, then follow its stream from that point. A drop reconnects from the highest
 * chat message id seen, and silence past the server's heartbeat counts as a drop even when no error event fires.
 * Every callback is fired only while this chat room is still the one on screen.
 */
export function useChatRoomStream(
	topicId: string | null,
	teamId: string,
	chatHandlers: {
		// the stored conversation, or null if this user may not open the chat room at all
		onChatMessagesLoaded: (chatMessages: ChatRoomMessage[] | null) => void
		onChatMessage: (chatMessage: ChatRoomMessage) => void
	},
): void {
	// the highest chat message id seen, which every reconnect resumes from
	const cursorRef = useRef(0)
	// the chat handlers are rebuilt every render. the effect reads the newest ones without restarting the stream
	const chatHandlersRef = useRef(chatHandlers)
	chatHandlersRef.current = chatHandlers

	useEffect(() => {
		let eventSource: EventSource | null = null
		let retryTimer: ReturnType<typeof setTimeout> | undefined
		let failedAttempts = 0
		let lastResponseTime = Date.now()
		// whether this effect still owns the chat room, flipped off by the cleanup
		let isCurrentChatRoom = true

		// a stream that goes silent past the server's heartbeat is dead, even if no error event fired
		const staleCheck = setInterval(() => {
			if (eventSource && Date.now() - lastResponseTime > STALE_STREAM_MS) {
				clearTimeout(retryTimer)
				eventSource.close()
				eventSource = null
				connect()
			}
		}, STALE_STREAM_MS / 4)

		// each connect resumes past the cursor. a drop replays nothing
		const connect = (): void => {
			lastResponseTime = Date.now()
			eventSource = new EventSource(toChatRoomEventsUrl(topicId, teamId, cursorRef.current))
			eventSource.addEventListener("message", (event) => {
				// a reconnect can overlap the cursor by one chat message. only what is new appends
				lastResponseTime = Date.now()
				const chatMessage = JSON.parse(event.data) as ChatRoomMessage
				cursorRef.current = Math.max(cursorRef.current, chatMessage.id)
				chatHandlersRef.current.onChatMessage(chatMessage)
			})

			// the heartbeat only marks the stream alive
			eventSource.addEventListener("ping", () => {
				lastResponseTime = Date.now()
			})

			// a stream that opens resets the attempt count the reconnect delay grows from
			eventSource.addEventListener("open", () => {
				failedAttempts = 0
			})

			// the browser's own retry reuses an old cursor. the reconnect is ours
			eventSource.addEventListener("error", () => {
				eventSource?.close()
				retryTimer = setTimeout(connect, toReconnectStreamDelayMs(failedAttempts))
				failedAttempts += 1
			})
		}

		// load once, then connect. a failed load retries on the same reconnect delay a dropped stream uses
		const loadAndConnectChatStream = async (): Promise<void> => {
			const chatMessages = await fetchChatRoomMessages(topicId, teamId)
			if (!isCurrentChatRoom) {
				return
			}
			if (chatMessages === "failed") {
				retryTimer = setTimeout(() => void loadAndConnectChatStream(), toReconnectStreamDelayMs(failedAttempts))
				failedAttempts += 1
				return
			}

			// onLoaded fires even when the chat room is empty. a rejected chat room never opens a stream
			chatHandlersRef.current.onChatMessagesLoaded(chatMessages)
			if (chatMessages === null) {
				return
			}
			cursorRef.current = chatMessages.at(-1)?.id ?? 0
			connect()
		}
		void loadAndConnectChatStream()

		// leaving the topic closes the chat stream and cancels any pending reconnect
		return () => {
			isCurrentChatRoom = false
			eventSource?.close()
			clearTimeout(retryTimer)
			clearInterval(staleCheck)
		}
	}, [topicId, teamId])
}

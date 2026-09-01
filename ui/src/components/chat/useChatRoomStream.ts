// the chat room's live stream: opening it, resuming past the cursor, and reconnecting when it drops
import type { ChatRoomMessage } from "@shared/contracts"
import { useEffect, useRef } from "react"
import { fetchChatRoomMessages, toChatRoomEventsUrl } from "@/clients/chatRoomClient"

// a dropped stream reconnects with exponential backoff from this base
const RECONNECT_BASE_MS = 1000

// the backoff never waits longer than this
const RECONNECT_MAX_MS = 30_000

// silence past this long means the stream is dead. the server pings well inside it
const STALE_STREAM_MS = 60_000

/**
 * The wait before the next reconnect: doubled per failed attempt up to the limit, then jittered
 * down by up to half so reconnecting clients spread apart.
 */
export function toReconnectDelayMs(failedAttempts: number): number {
	// double per failed attempt, never past the limit
	const backoffMs = Math.min(RECONNECT_BASE_MS * 2 ** failedAttempts, RECONNECT_MAX_MS)
	return backoffMs * (0.5 + Math.random() / 2)
}

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

			// a stream that opens resets the backoff
			eventSource.addEventListener("open", () => {
				failedAttempts = 0
			})

			// the browser's own retry reuses an old cursor. the reconnect is ours
			eventSource.addEventListener("error", () => {
				eventSource?.close()
				retryTimer = setTimeout(connect, toReconnectDelayMs(failedAttempts))
				failedAttempts += 1
			})
		}

		// onLoaded fires even when the chat room is empty, so the caller can finish loading
		fetchChatRoomMessages(topicId, teamId).then((chatMessages) => {
			if (!isCurrentChatRoom) {
				return
			}
			chatHandlersRef.current.onChatMessagesLoaded(chatMessages)
			// a refused chat room never opens a stream. there is nothing to follow
			if (chatMessages === null) {
				return
			}
			cursorRef.current = chatMessages.at(-1)?.id ?? 0
			connect()
		})

		// leaving the topic closes the chat stream and cancels any pending reconnect
		return () => {
			isCurrentChatRoom = false
			eventSource?.close()
			clearTimeout(retryTimer)
			clearInterval(staleCheck)
		}
	}, [topicId, teamId])
}

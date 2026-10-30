import { fetchChatRoomMessages, toChatRoomEventsUrl } from "@carlnotes/client/chatRoomClient"
import type { ChatRoomMessage, ChatRoomMessagePage } from "@carlnotes/contracts/chat"
import type { RoomTopicToolCalls } from "@carlnotes/contracts/chatTurns"
import { STALE_STREAM_MS, toReconnectStreamDelayMs } from "./streamReconnect"

export type ChatRoomHandlers = {
	onChatMessagesLoaded: (chatMessagePage: ChatRoomMessagePage | null) => void
	onChatMessage: (message: ChatRoomMessage) => void
	onTopicToolCalls: (toolCalls: RoomTopicToolCalls) => void
	onLoadFailed?: () => void
	// a page that did not match its contract, which is not retried on its own. reload reads the room again
	onLoadUnreadable?: (reload: () => void) => void
}
// what a connected stream reports: open, a chat message, tool calls, a ping, and an error with its status
export type ChatRoomEvents = {
	onOpen: () => void
	onMessage: (message: ChatRoomMessage) => void
	onToolCalls: (toolCalls: RoomTopicToolCalls) => void
	onPing: () => void
	onError: (status?: number) => void
}
// opens the platform's event connection and returns the function that closes it
export type ConnectChatRoomEvents = (url: string, events: ChatRoomEvents) => Promise<() => void>
// the room, its handlers, the platform transport, and the page read a test may replace
type OpenChatRoomStreamOptions = {
	topicId: string | null
	teamId: string
	handlers: ChatRoomHandlers
	connectEvents: ConnectChatRoomEvents
	loadMessages?: typeof fetchChatRoomMessages
}

/**
 * Loads a room and resumes its events after the highest chat message ID.
 */
export function openChatRoomStream({
	topicId,
	teamId,
	handlers,
	connectEvents,
	loadMessages = fetchChatRoomMessages,
}: OpenChatRoomStreamOptions): () => void {
	// track the connection, cursor, and retry timers
	let isClosed = false
	let connectionGeneration = 0
	let closeEvents: (() => void) | undefined
	let retryTimer: ReturnType<typeof setTimeout> | undefined
	let cursor = 0
	let failedAttemptCount = 0
	let lastResponseTime = Date.now()
	// close everything for good
	const dispose = (): void => {
		isClosed = true
		connectionGeneration += 1
		closeEvents?.()
		clearTimeout(retryTimer)
		clearInterval(staleCheck)
	}

	// close the current connection before retrying from the latest cursor
	const reconnect = (): void => {
		if (isClosed) {
			return
		}
		// retire the connection and schedule the next with a longer delay
		connectionGeneration += 1
		closeEvents?.()
		closeEvents = undefined
		clearTimeout(retryTimer)
		retryTimer = setTimeout(() => void connect(), toReconnectStreamDelayMs(failedAttemptCount))
		failedAttemptCount += 1
	}
	// open the events after the cursor, replacing the previous connection
	const connect = async (): Promise<void> => {
		if (isClosed) {
			return
		}
		// a callback from a connection this one replaced is ignored
		const connectionGenerationAtOpen = ++connectionGeneration
		const isCurrentConnection = (): boolean => !isClosed && connectionGenerationAtOpen === connectionGeneration
		lastResponseTime = Date.now()
		// take a callback only from the current connection, and note the response time
		const accept = (callback: () => void): void => {
			if (!isCurrentConnection()) {
				return
			}
			lastResponseTime = Date.now()
			callback()
		}
		// an open connection ends the backoff, a chat message moves the cursor, and tool calls and pings pass through
		try {
			const closeConnection = await connectEvents(toChatRoomEventsUrl(topicId, teamId, cursor), {
				onOpen: () =>
					accept(() => {
						failedAttemptCount = 0
					}),
				onMessage: (message) =>
					accept(() => {
						cursor = Math.max(cursor, message.id)
						handlers.onChatMessage(message)
					}),
				onToolCalls: (toolCalls) => accept(() => handlers.onTopicToolCalls(toolCalls)),
				onPing: () => accept(() => {}),
				onError: (status) => {
					if (!isCurrentConnection()) {
						return
					}
					// lost access ends the room, and any other error reconnects
					if (status === 401 || status === 403 || status === 404) {
						dispose()
						handlers.onChatMessagesLoaded(null)
						return
					}
					reconnect()
				},
			})
			// keep the function that closes the current connection, and close one that was replaced while opening
			if (isCurrentConnection()) {
				closeEvents = closeConnection
			} else {
				closeConnection()
			}
		} catch {
			// a connection that failed to open is retried
			if (isCurrentConnection()) {
				reconnect()
			}
		}
	}

	// distinguish a transient load failure, an unreadable page, and confirmed lost access
	const load = async (): Promise<void> => {
		const chatMessagePage = await loadMessages(topicId, teamId).catch(() => "failed" as const)
		if (isClosed) {
			return
		}
		// an unreadable page waits for the user's retry
		if (chatMessagePage === "unreadable") {
			handlers.onLoadUnreadable?.(() => void load())
			return
		}
		// a failed read retries on its own with a longer delay
		if (chatMessagePage === "failed") {
			handlers.onLoadFailed?.()
			retryTimer = setTimeout(() => void load(), toReconnectStreamDelayMs(failedAttemptCount))
			failedAttemptCount += 1
			return
		}
		// a loaded page or lost access is reported, and a loaded page connects past its last chat message
		handlers.onChatMessagesLoaded(chatMessagePage)
		if (chatMessagePage === null) {
			return
		}
		cursor = Math.max(0, ...chatMessagePage.chatMessages.map((message) => message.id))
		void connect()
	}
	// reconnect a connection that went quiet, and start with the page read
	const staleCheck = setInterval(() => {
		if (closeEvents && Date.now() - lastResponseTime > STALE_STREAM_MS) {
			reconnect()
		}
	}, STALE_STREAM_MS / 4)
	void load()
	return dispose
}

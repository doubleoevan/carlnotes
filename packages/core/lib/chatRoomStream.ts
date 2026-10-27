import { fetchChatRoomMessages, toChatRoomEventsUrl } from "@carlnotes/client/chatRoomClient"
import type { ChatRoomMessage, ChatRoomMessagePage, RoomTopicToolCalls } from "@carlnotes/contracts/chat"
import { STALE_STREAM_MS, toReconnectStreamDelayMs } from "./streamReconnect"

export type ChatRoomHandlers = {
	onChatMessagesLoaded: (chatMessagePage: ChatRoomMessagePage | null) => void
	onChatMessage: (message: ChatRoomMessage) => void
	onTopicToolCalls: (toolCalls: RoomTopicToolCalls) => void
	onLoadFailed?: () => void
}
export type ChatRoomEvents = {
	onOpen: () => void
	onMessage: (message: ChatRoomMessage) => void
	onToolCalls: (toolCalls: RoomTopicToolCalls) => void
	onPing: () => void
	onError: (status?: number) => void
}
export type ConnectChatRoomEvents = (url: string, events: ChatRoomEvents) => Promise<() => void>
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
		connectionGeneration += 1
		closeEvents?.()
		closeEvents = undefined
		clearTimeout(retryTimer)
		retryTimer = setTimeout(() => void connect(), toReconnectStreamDelayMs(failedAttemptCount))
		failedAttemptCount += 1
	}
	const connect = async (): Promise<void> => {
		if (isClosed) {
			return
		}
		const connectionGenerationAtOpen = ++connectionGeneration
		const isCurrentConnection = (): boolean => !isClosed && connectionGenerationAtOpen === connectionGeneration
		lastResponseTime = Date.now()
		const accept = (callback: () => void): void => {
			if (!isCurrentConnection()) {
				return
			}
			lastResponseTime = Date.now()
			callback()
		}
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
					if (status === 401 || status === 403 || status === 404) {
						dispose()
						handlers.onChatMessagesLoaded(null)
						return
					}
					reconnect()
				},
			})
			if (isCurrentConnection()) {
				closeEvents = closeConnection
			} else {
				closeConnection()
			}
		} catch {
			if (isCurrentConnection()) {
				reconnect()
			}
		}
	}

	// distinguish a transient load failure from confirmed lost access
	const load = async (): Promise<void> => {
		const chatMessagePage = await loadMessages(topicId, teamId).catch(() => "failed" as const)
		if (isClosed) {
			return
		}
		if (chatMessagePage === "failed") {
			handlers.onLoadFailed?.()
			retryTimer = setTimeout(() => void load(), toReconnectStreamDelayMs(failedAttemptCount))
			failedAttemptCount += 1
			return
		}
		handlers.onChatMessagesLoaded(chatMessagePage)
		if (chatMessagePage === null) {
			return
		}
		cursor = Math.max(0, ...chatMessagePage.chatMessages.map((message) => message.id))
		void connect()
	}
	const staleCheck = setInterval(() => {
		if (closeEvents && Date.now() - lastResponseTime > STALE_STREAM_MS) {
			reconnect()
		}
	}, STALE_STREAM_MS / 4)
	void load()
	return dispose
}

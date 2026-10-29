import type { ChatRoomMessage, RoomTopicToolCalls } from "@carlnotes/contracts/chat"
import { runWithRequestMemo } from "@carlnotes/db/requestMemo"
import type { SSEStreamingApi } from "hono/streaming"
import { streamSSE } from "hono/streaming"
import { auth } from "../auth"
import { type AppContext, currentUser } from "../currentUser"
import { loadBlockedUserIds } from "../userBlocks"
import { loadChatRoom } from "./roomAccess"
import { loadChatRoomDeltas, loadChatRoomMessages } from "./roomMessages"
import { onChatRoomMessage } from "./roomStream"
import { toUnblockedChatRoomMessages, toVisibleChatRoomMessages } from "./roomVisibility"

// the maximum room connection age before reconnecting
const CHAT_ROOM_STREAM_MAX_AGE_MS = 15 * 60 * 1000

/**
 * Streams a room while its original session retains access.
 */
export function streamChatRoomEvents(context: AppContext, topicId: string | null, teamId: string): Response {
	return streamSSE(context, (stream) => runChatRoomStream({ context, stream, topicId, teamId }))
}

// one room connection and its authorization context
type RunChatRoomStreamOptions = {
	context: AppContext
	stream: SSEStreamingApi
	topicId: string | null
	teamId: string
}

// keep one connection's delivery queue and cleanup together
async function runChatRoomStream({ context, stream, topicId, teamId }: RunChatRoomStreamOptions): Promise<void> {
	const userId = currentUser(context)
	// serialize the initial catch-up and notifications from the moment the stream opens
	let cursor = toChatMessageIdParam(context.req.query("after"))
	let isClosed = false
	let heartbeatInterval: ReturnType<typeof setInterval> | undefined
	let maxAgeTimeout: ReturnType<typeof setTimeout> | undefined
	let stopListening = (): void => {}
	await new Promise<void>((resolve) => {
		// retire listeners, timers and queued deliveries together
		const endStream = (): void => {
			if (isClosed) {
				return
			}
			// retire the connection and release the waiting response
			isClosed = true
			clearInterval(heartbeatInterval)
			clearTimeout(maxAgeTimeout)
			stopListening()
			void stream.close()
			resolve()
		}

		// re-read the session and room permissions outside the initial request's memo
		const checkAccess = async (): Promise<boolean> => {
			if (isClosed) {
				return false
			}
			// require the original session and current room membership
			const canReadRoom = await runWithRequestMemo(async () => {
				const session = await auth.api.getSession({
					headers: context.req.raw.headers,
					query: { disableCookieCache: true, disableRefresh: true },
				})
				return Boolean(userId && session?.user.id === userId && (await loadChatRoom(userId, topicId, teamId)))
			})
			if (!canReadRoom) {
				endStream()
			}
			return canReadRoom && !isClosed
		}

		// the people this member blocked, read as the stream opens and again on each heartbeat
		let blockedUserIds = new Set<string>()
		const toMemberChatMessages = async (
			chatMessages: ChatRoomMessage[],
			isHistory: boolean,
		): Promise<ChatRoomMessage[]> => {
			if (!userId) {
				return chatMessages
			}
			return isHistory
				? toVisibleChatRoomMessages(userId, chatMessages, blockedUserIds)
				: toUnblockedChatRoomMessages(chatMessages, blockedUserIds)
		}

		// the pending messages: the room past the cursor at first, then the deltas up to a published message
		const loadPendingChatMessages = (chatMessageId?: number): Promise<ChatRoomMessage[]> =>
			chatMessageId === undefined
				? loadChatRoomMessages(topicId, teamId, cursor)
				: loadChatRoomDeltas(topicId, teamId, cursor, chatMessageId)

		// check access after each read, before any message or Topic edit leaves the server
		const deliverChatMessages = async (chatMessageId?: number, roomToolCalls?: RoomTopicToolCalls): Promise<void> => {
			if (isClosed) {
				return
			}
			// read pending messages, drop the ones this member reported or blocked, and recheck access before delivery.
			// the history is filtered by a query, and a delta by the blocked people the stream holds
			const loadedChatMessages = await loadPendingChatMessages(chatMessageId)
			const chatMessages = await toMemberChatMessages(loadedChatMessages, chatMessageId === undefined)
			if (!(await checkAccess())) {
				return
			}
			// deliver the authorized batch and Topic edit results. the cursor moves past hidden messages too
			cursor = await writeChatMessages({
				stream,
				chatMessages,
				cursor: Math.max(cursor, ...loadedChatMessages.map((chatMessage) => chatMessage.id)),
				isClosed: () => isClosed,
			})
			if (roomToolCalls && !isClosed) {
				await writeRoomToolCalls(stream, roomToolCalls)
			}
		}

		// a failed delivery closes the stream so the client can resume from its last accepted cursor
		let deliveryChain = Promise.resolve()
		const enqueueDelivery = (deliver: () => Promise<void>): void => {
			deliveryChain = deliveryChain.then(deliver).catch((error) => {
				console.error("chat room event delivery failed", error)
				endStream()
			})
		}
		// deliver initial history before installing heartbeat timers
		enqueueDelivery(async () => {
			blockedUserIds = userId ? await loadBlockedUserIds(userId) : blockedUserIds
			await deliverChatMessages()
			if (isClosed) {
				return
			}
			// keep authorization current and bound the connection lifetime
			heartbeatInterval = setInterval(() => {
				enqueueDelivery(async () => {
					if (await checkAccess()) {
						blockedUserIds = userId ? await loadBlockedUserIds(userId) : blockedUserIds
						await stream.writeSSE({ event: "ping", data: "" })
					}
				})
			}, 25_000)
			// the connection ends at its age limit whatever the room does
			maxAgeTimeout = setTimeout(endStream, CHAT_ROOM_STREAM_MAX_AGE_MS)
		})
		// subscribe before delayed catch-up finishes
		stopListening = onChatRoomMessage(topicId, teamId, (chatMessageId, roomToolCalls) => {
			enqueueDelivery(() => deliverChatMessages(chatMessageId, roomToolCalls))
		})
		stream.onAbort(endStream)
	})
}

/**
 * Returns the positive whole message id a cursor names, or zero.
 */
export function toChatMessageIdParam(chatMessageIdParam: string | undefined): number {
	const chatMessageId = Number(chatMessageIdParam)
	return Number.isSafeInteger(chatMessageId) && chatMessageId > 0 ? chatMessageId : 0
}

// one authorized batch and its last delivered message
type WriteChatMessagesOptions = {
	stream: SSEStreamingApi
	chatMessages: ChatRoomMessage[]
	cursor: number
	isClosed: () => boolean
}

// advance the cursor only after each write succeeds
async function writeChatMessages({
	stream,
	chatMessages,
	cursor,
	isClosed,
}: WriteChatMessagesOptions): Promise<number> {
	// write each message as its own event until the stream closes, moving the cursor past it
	for (const chatMessage of chatMessages) {
		if (isClosed()) {
			break
		}
		await stream.writeSSE({ id: String(chatMessage.id), event: "message", data: JSON.stringify(chatMessage) })
		cursor = Math.max(cursor, chatMessage.id)
	}

	return cursor
}

// publish every Topic edit outcome, including an explicit cancellation
async function writeRoomToolCalls(stream: SSEStreamingApi, roomToolCalls: RoomTopicToolCalls): Promise<void> {
	// one event if there is any outcome to tell
	if (
		roomToolCalls.topicSaves.length > 0 ||
		roomToolCalls.topicSaveRejections.length > 0 ||
		roomToolCalls.proposedToUserId !== undefined ||
		roomToolCalls.isTopicEditCancelled === true
	) {
		// write the outcomes as one event
		await stream.writeSSE({ event: "topicToolCalls", data: JSON.stringify(roomToolCalls) })
	}
}

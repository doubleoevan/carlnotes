// the room conversation state for one team topic
import { hasAllMention, hasCarlMention, isCarlMessage } from "@shared/chatMentions"
import type { ChatAttachment, ChatRoomMessage } from "@shared/contracts"
import { useEffect, useRef, useState } from "react"
import { fetchChatRoomMessages, sendChatRoomMessage, toChatRoomEventsUrl } from "@/clients/chatRoomClient"

// a dropped stream reconnects with exponential backoff from this base
const RECONNECT_BASE_MS = 1000

// the backoff never waits longer than this
const RECONNECT_MAX_MS = 30_000

// silence past this long means the stream is dead. the server pings well inside it
const STALE_STREAM_MS = 60_000

export type ChatRoomState = {
	messages: ChatRoomMessage[]
	isLoaded: boolean
	// true when the room routes answered 404, so the panel can fall back to nothing
	isRefused: boolean
	// Carl's budget refusal, delivered only to the poster it answered
	refusalReason: string | null
	clearRefusalReason: () => void
	// whether carl owes the room an answer, for the shimmer under the chat messages
	isCarlThinking: boolean
	send: (content: string, replyToMessageId: number | null, attachments: ChatAttachment[]) => Promise<void>
	// re-read every chat message, for a change the stream never announces, like a removed file
	refresh: () => Promise<void>
}

// a null topic is the team's own room on its team page
export function useChatRoom(topicId: string | null, teamId: string): ChatRoomState {
	const [messages, setMessages] = useState<ChatRoomMessage[]>([])
	const [isLoaded, setIsLoaded] = useState(false)
	const [isRefused, setIsRefused] = useState(false)
	const [refusalReason, setRefusalReason] = useState<string | null>(null)
	// whether carl owes the room an answer. a send that addressed him sets it, and his reply clears it
	const [isCarlThinking, setIsCarlThinking] = useState(false)
	// the highest message id seen, which every reconnect resumes from
	const cursorRef = useRef(0)

	// load the chat messages once, then follow the stream from its end
	useEffect(() => {
		let source: EventSource | null = null
		let retryTimer: ReturnType<typeof setTimeout> | undefined
		let failedAttempts = 0
		let lastResponseTime = Date.now()

		// a stream that goes silent past the server's heartbeat is dead, even if no error event fired
		const staleCheck = setInterval(() => {
			if (source && Date.now() - lastResponseTime > STALE_STREAM_MS) {
				clearTimeout(retryTimer)
				source.close()
				source = null
				connect()
			}
		}, STALE_STREAM_MS / 4)
		// whether this effect still owns the room, flipped off by the cleanup
		let isCurrentRoom = true

		// each connect resumes past the cursor, so a drop replays nothing
		const connect = (): void => {
			lastResponseTime = Date.now()
			source = new EventSource(toChatRoomEventsUrl(topicId, teamId, cursorRef.current))
			source.addEventListener("message", (event) => {
				// a reconnect can overlap the cursor by one message, so only what is new appends
				lastResponseTime = Date.now()
				const message = JSON.parse(event.data) as ChatRoomMessage
				cursorRef.current = Math.max(cursorRef.current, message.id)
				setMessages((known) => (known.some((existing) => existing.id === message.id) ? known : [...known, message]))
				// carl's arriving message ends the wait his mention started
				if (isCarlMessage(message)) {
					setIsCarlThinking(false)
				}
			})

			// the heartbeat only marks the stream alive
			source.addEventListener("ping", () => {
				lastResponseTime = Date.now()
			})

			// a stream that opens resets the backoff
			source.addEventListener("open", () => {
				failedAttempts = 0
			})

			// the browser's own retry reuses a stale cursor, so the reconnect is ours
			source.addEventListener("error", () => {
				source?.close()
				retryTimer = setTimeout(connect, toReconnectDelayMs(failedAttempts))
				failedAttempts += 1
			})
		}

		// the chat messages set the loading state even when the room is empty
		fetchChatRoomMessages(topicId, teamId).then((chatMessages) => {
			if (!isCurrentRoom) {
				return
			}
			// a failed load means no chat room for this user, and the stream never opens
			if (chatMessages === null) {
				setIsRefused(true)
				setIsLoaded(true)
				return
			}
			// the chat messages arrive, and the stream resumes from its end
			setMessages(chatMessages)
			cursorRef.current = chatMessages.at(-1)?.id ?? 0
			setIsLoaded(true)
			connect()
		})

		// leaving the topic closes the chat stream and cancels any pending reconnect
		return () => {
			isCurrentRoom = false
			source?.close()
			clearTimeout(retryTimer)
			clearInterval(staleCheck)
		}
	}, [topicId, teamId])

	// the posted message arrives back through the stream
	const send = async (
		content: string,
		replyToMessageId: number | null,
		attachments: ChatAttachment[],
	): Promise<void> => {
		const postResponse = await sendChatRoomMessage(topicId, teamId, content, replyToMessageId, attachments)
		if (postResponse === "attachmentRefused") {
			setRefusalReason("Those files didn't post. One may be unreadable, or you have shared too many files here.")
			return
		}
		setRefusalReason(postResponse?.refusalReason ?? null)

		// a send that gives carl the turn starts the wait his reply or refusal ends
		const repliedTo = replyToMessageId === null ? undefined : messages.find((known) => known.id === replyToMessageId)
		const isCarlTurn =
			hasCarlMention(content) || hasAllMention(content) || (repliedTo !== undefined && isCarlMessage(repliedTo))
		if (isCarlTurn && postResponse !== null && postResponse.refusalReason === null) {
			setIsCarlThinking(true)
		}
	}

	// re-read every chat message, for a change the stream never announces, like a removed file
	const refresh = async (): Promise<void> => {
		const chatMessages = await fetchChatRoomMessages(topicId, teamId)
		if (chatMessages !== null) {
			setMessages(chatMessages)
		}
	}

	return {
		messages,
		isLoaded,
		isRefused,
		refusalReason,
		isCarlThinking,
		clearRefusalReason: () => setRefusalReason(null),
		send,
		refresh,
	}
}

/**
 * The wait before the next reconnect: doubled per failed attempt up to the limit, then jittered
 * down by up to half so reconnecting clients spread apart.
 */
export function toReconnectDelayMs(failedAttempts: number): number {
	// double per failed attempt, never past the limit
	const backoffMs = Math.min(RECONNECT_BASE_MS * 2 ** failedAttempts, RECONNECT_MAX_MS)
	return backoffMs * (0.5 + Math.random() / 2)
}

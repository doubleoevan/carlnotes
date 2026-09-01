// the chat room conversation state for one team topic
import { hasAllMention, hasModelMention, isModelChatMessage } from "@shared/chatMentions"
import type { ChatAttachment, ChatRoomMessage } from "@shared/contracts"
import { useEffect, useRef, useState } from "react"
import { fetchChatRoomMessageLinkPreviews, fetchChatRoomMessages, sendChatRoomMessage } from "@/clients/chatRoomClient"
import { useChatRoomStream } from "@/components/chat/useChatRoomStream"
import { hasPreviewableLink } from "@/components/common/LinkPreviewCard"

export type ChatRoomState = {
	chatMessages: ChatRoomMessage[]
	isLoaded: boolean
	// true if the chat room routes answered 404, so the panel can fall back to nothing
	isRefused: boolean
	// Carl's budget refusal, delivered only to the poster it answered
	refusalReason: string | null
	clearRefusalReason: () => void
	// whether carl owes the chat room an answer, for the shimmer under the chat messages
	isMessageLoading: boolean
	postChatMessage: (
		content: string,
		replyToChatMessageId: number | null,
		attachments: ChatAttachment[],
	) => Promise<void>
	// re-read every chat message, for a change the stream never announces, like a removed file
	reloadChatMessages: () => Promise<void>
	// the fresh chat messages with links whose link preview cards are still loading in the background
	loadingChatMessageIds: Set<number>
}

// a null topic is the team's own chat room on its team page
export function useChatRoom(topicId: string | null, teamId: string): ChatRoomState {
	const [chatMessages, setChatMessages] = useState<ChatRoomMessage[]>([])
	const [isLoaded, setIsLoaded] = useState(false)
	const [isRefused, setIsRefused] = useState(false)
	const [refusalReason, setRefusalReason] = useState<string | null>(null)
	// whether carl owes the chat room an answer. a send that addressed him sets it, and his reply clears it
	const [isMessageLoading, setIsMessageLoading] = useState(false)

	// each loading chat message id with the attempts it has left, the timer for the next one, and the loading ids
	const linkPreviewAttemptsRef = useRef(new Map<number, number>())
	const linkPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const [loadingChatMessageIds, setLoadingChatMessageIds] = useState<Set<number>>(new Set())

	// one refresh: read just the loading chat messages' cards, merge any that landed, and keep loading the rest
	const runLinkPreviewRefresh = async (): Promise<void> => {
		linkPreviewTimerRef.current = null
		const loadingLinkPreviewIds = [...linkPreviewAttemptsRef.current.keys()]
		const linkPreviewsById = await fetchChatRoomMessageLinkPreviews(topicId, teamId, loadingLinkPreviewIds)

		// each loading chat message: merge its cards if they landed, else keep loading while tries remain
		const loadingChatMessageIds = new Set<number>()
		for (const [chatMessageId, tries] of linkPreviewAttemptsRef.current) {
			mergeLoadingChatMessage(chatMessageId, tries, linkPreviewsById[chatMessageId] ?? [], loadingChatMessageIds)
		}

		// load again while any chat message is still bare with tries left
		setLoadingChatMessageIds(loadingChatMessageIds)
		if (loadingChatMessageIds.size > 0) {
			scheduleLinkPreviewRefresh()
		}
	}

	// merge a chat message's cards if they landed, otherwise decrement its tries and keep it loading
	const mergeLoadingChatMessage = (
		chatMessageId: number,
		tries: number,
		linkPreviews: ChatRoomMessage["linkPreviews"],
		stillLoading: Set<number>,
	): void => {
		// cards landed: merge them into the chat message and drop it from the loading set
		if (linkPreviews.length > 0) {
			linkPreviewAttemptsRef.current.delete(chatMessageId)
			setChatMessages((known) =>
				known.map((chatMessage) => (chatMessage.id === chatMessageId ? { ...chatMessage, linkPreviews } : chatMessage)),
			)
			return
		}

		// still bare: keep loading while it has tries, otherwise give up on it
		if (tries > 1) {
			linkPreviewAttemptsRef.current.set(chatMessageId, tries - 1)
			stillLoading.add(chatMessageId)
		} else {
			linkPreviewAttemptsRef.current.delete(chatMessageId)
		}
	}

	// the next refresh runs once, a beat later, if one is not already booked
	const scheduleLinkPreviewRefresh = (): void => {
		linkPreviewTimerRef.current ??= setTimeout(() => void runLinkPreviewRefresh(), 2500)
	}

	// unmounting cancels the pending refresh
	useEffect(() => {
		return () => {
			if (linkPreviewTimerRef.current) {
				clearTimeout(linkPreviewTimerRef.current)
			}
		}
	}, [])

	// the stream owns opening, resuming, and reconnecting. this hook only says what to do with what arrives
	useChatRoomStream(topicId, teamId, {
		onChatMessagesLoaded: (chatMessages) => {
			// a failed load means no chat room for this user, and the stream never opens
			if (chatMessages === null) {
				setIsRefused(true)
				setIsLoaded(true)
				return
			}
			setChatMessages(chatMessages)
			setIsLoaded(true)
		},
		onChatMessage: (chatMessage) => {
			setChatMessages((known) =>
				known.some((existing) => existing.id === chatMessage.id) ? known : [...known, chatMessage],
			)
			// a fresh chat message with a link loads under it until its cards land
			if (hasPreviewableLink(chatMessage.content) && chatMessage.linkPreviews.length === 0) {
				linkPreviewAttemptsRef.current.set(chatMessage.id, 6)
				setLoadingChatMessageIds((loading) => new Set(loading).add(chatMessage.id))
				scheduleLinkPreviewRefresh()
			}
			// carl's arriving chat message ends the wait his chat mention started
			if (isModelChatMessage(chatMessage)) {
				setIsMessageLoading(false)
			}
		},
	})

	// the posted chat message arrives back through the stream
	const postChatMessage = async (
		content: string,
		replyToChatMessageId: number | null,
		attachments: ChatAttachment[],
	): Promise<void> => {
		const postResponse = await sendChatRoomMessage(topicId, teamId, content, replyToChatMessageId, attachments)
		if (postResponse === "attachmentRefused") {
			setRefusalReason("Those files didn't post. One may be unreadable, or you have shared too many files here.")
			return
		}
		setRefusalReason(postResponse?.refusalReason ?? null)

		// a post that gives carl the chat turn starts the wait his reply or refusal ends
		const repliedTo =
			replyToChatMessageId === null ? undefined : chatMessages.find((known) => known.id === replyToChatMessageId)
		const isModelChatTurn =
			hasModelMention(content) || hasAllMention(content) || (repliedTo !== undefined && isModelChatMessage(repliedTo))
		if (isModelChatTurn && postResponse !== null && postResponse.refusalReason === null) {
			setIsMessageLoading(true)
		}
	}

	// re-read every chat message, for a change the stream never announces, like a removed file
	const reloadChatMessages = async (): Promise<void> => {
		const chatMessages = await fetchChatRoomMessages(topicId, teamId)
		if (chatMessages !== null) {
			setChatMessages(chatMessages)
		}
	}

	return {
		chatMessages,
		isLoaded,
		isRefused,
		refusalReason,
		isMessageLoading,
		clearRefusalReason: () => setRefusalReason(null),
		postChatMessage,
		reloadChatMessages,
		loadingChatMessageIds,
	}
}

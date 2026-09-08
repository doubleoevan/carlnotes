// the chat room conversation state for one team topic
import { hasAllMention, hasModelMention, isModelChatMessage } from "@shared/chatMentions"
import { CHAT_ROOM_ATTACHMENT_LIMIT, type ChatAttachment, type ChatRoomMessage } from "@shared/contracts"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { fetchChatRoomMessageLinkPreviews, fetchChatRoomMessages, sendChatRoomMessage } from "@/clients/chatRoomClient"
import { useChatRoomStream } from "@/components/chat/useChatRoomStream"
import { hasPreviewableLink } from "@/components/common/LinkPreviewCard"

// where the virtualized list numbers its first chat message before any earlier page is prepended. it
// starts very high because prepending lowers it, and it may never go below zero
export const FIRST_ITEM_INDEX_START = 1_000_000

export type ChatRoomState = {
	chatMessages: ChatRoomMessage[]
	isLoaded: boolean
	// true if the chat room routes answered 404, so the panel can fall back to nothing
	isRejected: boolean
	// Carl's budget rejection, delivered only to the poster it answered
	rejectionReason: string | null
	clearRejectionReason: () => void
	// whether carl owes the chat room an answer, for the shimmer under the chat messages
	isMessageLoading: boolean
	// resolves false when the post failed
	postChatMessage: (
		content: string,
		replyToChatMessageId: number | null,
		chatAttachments: ChatAttachment[],
	) => Promise<boolean>
	// prepend the page above the earliest chat message loaded, answering how many arrived and 0 when none did
	loadEarlierChatMessages: () => Promise<number>
	// whether a page sits above the earliest chat message loaded
	hasEarlierChatMessages: boolean
	// where the virtualized list numbers its first chat message, lowered by every prepend
	firstItemIndex: number
	// re-read every chat message, for a change the stream never announces, like a removed file
	reloadChatMessages: () => Promise<void>
	// the fresh chat messages with links whose link preview cards are still loading in the background
	loadingChatMessageIds: Set<number>
}

// a null topic is the team's own chat room on its team page
export function useChatRoom(topicId: string | null, teamId: string): ChatRoomState {
	const [chatMessages, setChatMessages] = useState<ChatRoomMessage[]>([])
	const [isLoaded, setIsLoaded] = useState(false)
	const [isRejected, setIsRejected] = useState(false)
	const [rejectionReason, setRejectionReason] = useState<string | null>(null)
	// whether carl owes the chat room an answer. a send that addressed him sets it, and his reply clears it
	const [isMessageLoading, setIsMessageLoading] = useState(false)

	// each loading chat message id with the attempts it has left, the timer for the next one, and the loading ids
	const linkPreviewAttemptsRef = useRef(new Map<number, number>())
	const linkPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const [loadingChatMessageIds, setLoadingChatMessageIds] = useState<Set<number>>(new Set())
	// whether a page sits above the earliest chat message loaded, and whether one is already on its way
	const [hasEarlierChatMessages, setHasOlderChatMessages] = useState(false)
	// where the virtualized list initializes its first chat message number to. it lives here so a prepend lowers it in
	// the same update that grows the list, leaving no render where one moved without the other
	const [firstItemIndex, setFirstItemIndex] = useState(FIRST_ITEM_INDEX_START)
	const isLoadingEarlierChatMessagesRef = useRef(false)

	// one refresh: read just the loading chat messages' cards, merge any that loaded, and keep loading the rest
	const runLinkPreviewRefresh = async (): Promise<void> => {
		linkPreviewTimerRef.current = null
		const loadingLinkPreviewIds = [...linkPreviewAttemptsRef.current.keys()]
		const linkPreviewsById = await fetchChatRoomMessageLinkPreviews(topicId, teamId, loadingLinkPreviewIds)

		// each loading chat message: merge its cards if they loaded, or keep loading while attempts remain
		const loadingChatMessageIds = new Set<number>()
		for (const [chatMessageId, attemptsLeft] of linkPreviewAttemptsRef.current) {
			mergeLoadingChatMessage(chatMessageId, attemptsLeft, linkPreviewsById[chatMessageId] ?? [], loadingChatMessageIds)
		}

		// load again while any chat message is still bare with attempts left
		setLoadingChatMessageIds(loadingChatMessageIds)
		if (loadingChatMessageIds.size > 0) {
			scheduleLinkPreviewRefresh()
		}
	}

	// merge a chat message's cards if they loaded, otherwise decrement its attempts and keep it loading
	const mergeLoadingChatMessage = (
		chatMessageId: number,
		attemptsLeft: number,
		linkPreviews: ChatRoomMessage["linkPreviews"],
		stillLoading: Set<number>,
	): void => {
		// cards loaded: merge them into the chat message and drop it from the loading set
		if (linkPreviews.length > 0) {
			linkPreviewAttemptsRef.current.delete(chatMessageId)
			setChatMessages((known) =>
				known.map((chatMessage) => (chatMessage.id === chatMessageId ? { ...chatMessage, linkPreviews } : chatMessage)),
			)
			return
		}

		// still bare: keep loading while it has attempts left, otherwise give up on it
		if (attemptsLeft > 1) {
			linkPreviewAttemptsRef.current.set(chatMessageId, attemptsLeft - 1)
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
		onChatMessagesLoaded: (chatMessagePage) => {
			// a failed load means no chat room for this user, and the stream never opens
			if (chatMessagePage === null) {
				setIsRejected(true)
				setIsLoaded(true)
				return
			}
			setChatMessages(chatMessagePage.chatMessages)
			setHasOlderChatMessages(chatMessagePage.hasEarlierChatMessages)
			setFirstItemIndex(FIRST_ITEM_INDEX_START)
			setIsLoaded(true)
		},
		onChatMessage: (chatMessage) => {
			setChatMessages((known) =>
				known.some((existing) => existing.id === chatMessage.id) ? known : [...known, chatMessage],
			)
			// a fresh chat message with a link loads under it until its cards load
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
	): Promise<boolean> => {
		const postResult = await sendChatRoomMessage(topicId, teamId, content, replyToChatMessageId, attachments).catch(
			() => null,
		)
		if (postResult === "attachmentLimitReached") {
			setRejectionReason(
				`That would pass the ${CHAT_ROOM_ATTACHMENT_LIMIT} files you can share in this chat room. Delete some to share more.`,
			)
			return false
		}
		if (postResult === "attachmentRejected") {
			setRejectionReason("Those files didn't post. One of them may be unreadable.")
			return false
		}
		if (postResult === null) {
			toast("That didn't post. Try again.")
			return false
		}
		setRejectionReason(postResult.rejectionReason)

		// a post that gives carl the chat turn starts the wait his reply or rejection ends
		const repliedTo =
			replyToChatMessageId === null ? undefined : chatMessages.find((known) => known.id === replyToChatMessageId)
		const isModelChatTurn =
			hasModelMention(content) || hasAllMention(content) || (repliedTo !== undefined && isModelChatMessage(repliedTo))
		if (isModelChatTurn && postResult.rejectionReason === null) {
			setIsMessageLoading(true)
		}
		return true
	}

	// re-read every chat message, for a change the stream never announces, like a removed file
	const reloadChatMessages = async (): Promise<void> => {
		const chatMessagePage = await fetchChatRoomMessages(topicId, teamId)
		if (chatMessagePage !== null && chatMessagePage !== "failed") {
			setChatMessages(chatMessagePage.chatMessages)
			setHasOlderChatMessages(chatMessagePage.hasEarlierChatMessages)
			setFirstItemIndex(FIRST_ITEM_INDEX_START)
		}
	}

	const loadOlderChatMessages = async (): Promise<number> => {
		const earliestChatMessage = chatMessages[0]
		if (!earliestChatMessage || !hasEarlierChatMessages || isLoadingEarlierChatMessagesRef.current) {
			return 0
		}
		isLoadingEarlierChatMessagesRef.current = true
		try {
			// the chat message cursor is exclusive, so an earlier page never repeats a chat message already loaded
			const earlierChatMessagePage = await fetchChatRoomMessages(topicId, teamId, earliestChatMessage.id)
			if (earlierChatMessagePage === null || earlierChatMessagePage === "failed") {
				return 0
			}
			setHasOlderChatMessages(earlierChatMessagePage.hasEarlierChatMessages)
			if (earlierChatMessagePage.chatMessages.length === 0) {
				return 0
			}
			setChatMessages((known) => [...earlierChatMessagePage.chatMessages, ...known])
			setFirstItemIndex((index) => index - earlierChatMessagePage.chatMessages.length)
			return earlierChatMessagePage.chatMessages.length
		} finally {
			isLoadingEarlierChatMessagesRef.current = false
		}
	}

	return {
		chatMessages,
		isLoaded,
		isRejected,
		rejectionReason,
		isMessageLoading,
		clearRejectionReason: () => setRejectionReason(null),
		postChatMessage,
		reloadChatMessages,
		loadEarlierChatMessages: loadOlderChatMessages,
		hasEarlierChatMessages,
		firstItemIndex,
		loadingChatMessageIds,
	}
}

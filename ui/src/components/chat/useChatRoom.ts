// the chat room conversation state for one team topic
import { hasAllMention, hasModelMention, isModelChatMessage } from "@shared/chatMentions"
import type { ChatAttachment, ChatRoomMessage, ChatRoomMessagePage, RoomTopicToolCalls } from "@shared/contracts"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { fetchChatRoomMessageLinkPreviews, fetchChatRoomMessages, sendChatRoomMessage } from "@/clients/chatRoomClient"
import { applyTopicEditToolCalls, toastTopicToolCalls } from "@/components/chat/topicToolCalls"
import { useChatRoomStream } from "@/components/chat/useChatRoomStream"
import { hasPreviewableLink } from "@/components/common/LinkPreviewCard"
import { publishTopicChanged } from "@/stores/chatPanelStore"

// where the virtualized list numbers its first chat message before any earlier page is prepended. it
// starts very high because prepending lowers it, and it may never go below zero
export const FIRST_ITEM_INDEX_START = 1_000_000

// why a post was rejected privately to its poster: Carl's spent budget, too many files, or an unreadable file
export type ChatRoomRejection = "budget" | "attachmentLimitReached" | "attachmentRejected"

export type ChatRoomState = {
	chatMessages: ChatRoomMessage[]
	isLoaded: boolean
	// true if the chat room routes answered 404, so the panel can fall back to nothing
	isRejected: boolean
	// why the poster's last post was rejected, shown only to that poster
	rejection: ChatRoomRejection | null
	clearRejection: () => void
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

type UseChatRoomOptions = {
	// a null topic is the team's own chat room on its team page
	topicId: string | null
	teamId: string
	userId: string | undefined
}

export function useChatRoom({ topicId, teamId, userId }: UseChatRoomOptions): ChatRoomState {
	const [isLoaded, setIsLoaded] = useState(false)
	const [isRejected, setIsRejected] = useState(false)
	const [rejection, setRejection] = useState<ChatRoomRejection | null>(null)
	// whether carl owes the chat room an answer. a send that addressed him sets it, and his reply clears it
	const [isMessageLoading, setIsMessageLoading] = useState(false)
	// the chat messages loaded so far, and the pages of messages above them
	const {
		chatMessages,
		setChatMessages,
		showFirstChatMessagePage,
		loadEarlierChatMessages,
		reloadChatMessages,
		hasEarlierChatMessages,
		firstItemIndex,
	} = useChatMessagePages({ topicId, teamId })
	// the fresh chat messages whose link preview cards are still loading in the background
	const { loadingChatMessageIds, startLinkPreviewRefresh } = useChatRoomLinkPreviews({
		topicId,
		teamId,
		setChatMessages,
	})

	// the stream owns opening, resuming, and reconnecting. this hook only says what to do with what arrives
	useChatRoomStream(topicId, teamId, {
		onChatMessagesLoaded: (chatMessagePage) => {
			// a failed load means no chat room for this user, and the stream never opens
			if (chatMessagePage === null) {
				setIsRejected(true)
				setIsLoaded(true)
				return
			}
			// the first page of messages replaces the list and resets the virtual index
			showFirstChatMessagePage(chatMessagePage)
			setIsLoaded(true)
		},
		onChatMessage: (chatMessage) => {
			setChatMessages((knownChatMessages) =>
				knownChatMessages.some((knownChatMessage) => knownChatMessage.id === chatMessage.id)
					? knownChatMessages
					: [...knownChatMessages, chatMessage],
			)
			// load a fresh chat message's link preview cards in the background
			startLinkPreviewRefresh(chatMessage)
			// carl's arriving chat message ends the wait his chat mention started
			if (isModelChatMessage(chatMessage)) {
				setIsMessageLoading(false)
			}
		},
		// toast the saves and the rejections for every member, then reload the topic page behind the panel
		onTopicToolCalls: (roomToolCalls) => applyChatRoomToolCalls({ roomToolCalls, topicId, userId }),
	})

	// the posted chat message arrives back through the stream
	const postChatMessage = async (
		content: string,
		replyToChatMessageId: number | null,
		attachments: ChatAttachment[],
	): Promise<boolean> => {
		const postChatMessageResult = await sendChatRoomMessage(
			topicId,
			teamId,
			content,
			replyToChatMessageId,
			attachments,
		).catch(() => null)
		// too many files and an unreadable file each say so and post nothing
		if (postChatMessageResult === "attachmentLimitReached" || postChatMessageResult === "attachmentRejected") {
			setRejection(postChatMessageResult)
			return false
		}
		// a failed post says so and posts nothing
		if (postChatMessageResult === null) {
			toast("That didn't post. Try again.")
			return false
		}
		// a posted chat message may still show the budget gate's rejection in place of carl's reply
		setRejection(postChatMessageResult.rejectionReason === null ? null : "budget")

		// a post that gives carl the chat turn starts the wait his reply or rejection ends
		const repliedToChatMessage =
			replyToChatMessageId === null
				? undefined
				: chatMessages.find((knownChatMessage) => knownChatMessage.id === replyToChatMessageId)
		// start the wait for carl's reply, unless the budget gate turned the post down
		if (isModelChatTurnPost(content, repliedToChatMessage) && postChatMessageResult.rejectionReason === null) {
			setIsMessageLoading(true)
		}
		return true
	}

	return {
		chatMessages,
		isLoaded,
		isRejected,
		rejection,
		isMessageLoading,
		clearRejection: () => setRejection(null),
		postChatMessage,
		reloadChatMessages,
		loadEarlierChatMessages,
		hasEarlierChatMessages,
		firstItemIndex,
		loadingChatMessageIds,
	}
}

// the chat messages loaded so far and the pages above them, with the virtual index that a prepend lowers
type ChatMessagePages = Pick<
	ChatRoomState,
	"chatMessages" | "loadEarlierChatMessages" | "reloadChatMessages" | "hasEarlierChatMessages" | "firstItemIndex"
> & {
	setChatMessages: React.Dispatch<React.SetStateAction<ChatRoomMessage[]>>
	showFirstChatMessagePage: (chatMessagePage: ChatRoomMessagePage) => void
}

// keep the loaded chat messages, paging earlier ones in above them and reloading the whole list
function useChatMessagePages({ topicId, teamId }: Omit<UseChatRoomOptions, "userId">): ChatMessagePages {
	const [chatMessages, setChatMessages] = useState<ChatRoomMessage[]>([])
	// whether a page sits above the earliest chat message loaded, and whether one is already on its way
	const [hasEarlierChatMessages, setHasEarlierChatMessages] = useState(false)
	const isLoadingEarlierChatMessagesRef = useRef(false)
	// the number that the virtualized list gives its first chat message.
	// a prepend lowers it in the same update that grows the list, so no render shows one moved without the other
	const [firstItemIndex, setFirstItemIndex] = useState(FIRST_ITEM_INDEX_START)

	// replace the list with a first page and reset the virtual index
	const showFirstChatMessagePage = (chatMessagePage: ChatRoomMessagePage): void => {
		setChatMessages(chatMessagePage.chatMessages)
		setHasEarlierChatMessages(chatMessagePage.hasEarlierChatMessages)
		setFirstItemIndex(FIRST_ITEM_INDEX_START)
	}

	// re-read every chat message, for a change the stream never announces, like a removed file
	const reloadChatMessages = async (): Promise<void> => {
		const chatMessagePage = await fetchChatRoomMessages(topicId, teamId)
		if (chatMessagePage !== null && chatMessagePage !== "failed") {
			showFirstChatMessagePage(chatMessagePage)
		}
	}

	// prepend the page of messages above the earliest chat message loaded, returning how many arrived
	const loadEarlierChatMessages = async (): Promise<number> => {
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
			// an empty page means the top was reached
			setHasEarlierChatMessages(earlierChatMessagePage.hasEarlierChatMessages)
			if (earlierChatMessagePage.chatMessages.length === 0) {
				return 0
			}
			// the earlier page goes above the known list, and the virtual index moves up by its length
			setChatMessages((knownChatMessages) => [...earlierChatMessagePage.chatMessages, ...knownChatMessages])
			setFirstItemIndex((previousFirstItemIndex) => previousFirstItemIndex - earlierChatMessagePage.chatMessages.length)
			return earlierChatMessagePage.chatMessages.length
		} finally {
			isLoadingEarlierChatMessagesRef.current = false
		}
	}
	return {
		chatMessages,
		setChatMessages,
		showFirstChatMessagePage,
		loadEarlierChatMessages,
		reloadChatMessages,
		hasEarlierChatMessages,
		firstItemIndex,
	}
}

// the chat room that the link preview cards are read from, and the list that their cards merge into
type UseChatRoomLinkPreviewsOptions = Omit<UseChatRoomOptions, "userId"> & {
	setChatMessages: ChatMessagePages["setChatMessages"]
}

// the loading chat message ids, and a function that starts loading a fresh chat message's cards
type ChatRoomLinkPreviews = {
	loadingChatMessageIds: Set<number>
	startLinkPreviewRefresh: (chatMessage: ChatRoomMessage) => void
}

// the background polling for fresh chat messages' link preview cards, giving up on each after a few attempts
function useChatRoomLinkPreviews({
	topicId,
	teamId,
	setChatMessages,
}: UseChatRoomLinkPreviewsOptions): ChatRoomLinkPreviews {
	// each loading chat message id with the attempts it has left, the timer for the next one, and the loading ids
	const linkPreviewAttemptsRef = useRef(new Map<number, number>())
	const linkPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const [loadingChatMessageIds, setLoadingChatMessageIds] = useState<Set<number>>(new Set())

	// one refresh: read just the loading chat messages' cards, merge any that loaded, and keep loading the rest
	const runLinkPreviewRefresh = async (): Promise<void> => {
		linkPreviewTimerRef.current = null
		const loadingLinkPreviewIds = [...linkPreviewAttemptsRef.current.keys()]
		const linkPreviewsById = await fetchChatRoomMessageLinkPreviews(topicId, teamId, loadingLinkPreviewIds)

		// each loading chat message: merge its cards if they loaded, or keep loading while attempts remain
		const stillLoadingChatMessageIds = new Set<number>()
		for (const [chatMessageId, attemptsLeft] of linkPreviewAttemptsRef.current) {
			mergeLoadingChatMessage(
				chatMessageId,
				attemptsLeft,
				linkPreviewsById[chatMessageId] ?? [],
				stillLoadingChatMessageIds,
			)
		}

		// load again while any chat message still has no cards and attempts left
		setLoadingChatMessageIds(stillLoadingChatMessageIds)
		if (stillLoadingChatMessageIds.size > 0) {
			scheduleLinkPreviewRefresh()
		}
	}

	// merge a chat message's cards if they loaded, otherwise decrement its attempts and keep it loading
	const mergeLoadingChatMessage = (
		chatMessageId: number,
		attemptsLeft: number,
		linkPreviews: ChatRoomMessage["linkPreviews"],
		stillLoadingChatMessageIds: Set<number>,
	): void => {
		// cards loaded: merge them into the chat message and drop it from the loading set
		if (linkPreviews.length > 0) {
			linkPreviewAttemptsRef.current.delete(chatMessageId)
			setChatMessages((knownChatMessages) =>
				knownChatMessages.map((chatMessage) =>
					chatMessage.id === chatMessageId ? { ...chatMessage, linkPreviews } : chatMessage,
				),
			)
			return
		}

		// still no cards: keep loading while it has attempts left, otherwise give up on it
		if (attemptsLeft > 1) {
			linkPreviewAttemptsRef.current.set(chatMessageId, attemptsLeft - 1)
			stillLoadingChatMessageIds.add(chatMessageId)
		} else {
			linkPreviewAttemptsRef.current.delete(chatMessageId)
		}
	}

	// schedule one refresh 2.5 seconds out, unless one is already scheduled
	const scheduleLinkPreviewRefresh = (): void => {
		linkPreviewTimerRef.current ??= setTimeout(() => void runLinkPreviewRefresh(), 2500)
	}

	// cancel the pending refresh on unmount
	useEffect(() => {
		return () => {
			if (linkPreviewTimerRef.current) {
				clearTimeout(linkPreviewTimerRef.current)
			}
		}
	}, [])

	// start loading a fresh chat message's link preview cards, if it has a link and no cards yet
	const startLinkPreviewRefresh = (chatMessage: ChatRoomMessage): void => {
		if (!hasPreviewableLink(chatMessage.content) || chatMessage.linkPreviews.length > 0) {
			return
		}
		// give it six attempts and show its card as loading
		linkPreviewAttemptsRef.current.set(chatMessage.id, 6)
		setLoadingChatMessageIds((previousLoadingChatMessageIds) =>
			new Set(previousLoadingChatMessageIds).add(chatMessage.id),
		)
		scheduleLinkPreviewRefresh()
	}
	return { loadingChatMessageIds, startLinkPreviewRefresh }
}

// the chat room's tool calls, the topic they changed, and the member they are shown to
type ApplyChatRoomToolCallsOptions = {
	roomToolCalls: RoomTopicToolCalls
	topicId: string | null
	userId: string | undefined
}

// toast the saves and the rejections for every member, preview a proposal for the member that carl proposed to,
// and reload the topic page behind the panel
function applyChatRoomToolCalls({ roomToolCalls, topicId, userId }: ApplyChatRoomToolCallsOptions): void {
	toastTopicToolCalls(roomToolCalls)
	if (!topicId) {
		return
	}
	// preview only for the member that carl proposed to. a save reaches everyone watching
	const isProposedToThisMember = userId !== undefined && roomToolCalls.proposedToUserId === userId
	applyTopicEditToolCalls(topicId, {
		proposedTopicEdit: isProposedToThisMember ? roomToolCalls.proposedTopicEdit : undefined,
		isTopicEditCancelled: isProposedToThisMember && roomToolCalls.isTopicEditCancelled,
		topicSaves: roomToolCalls.topicSaves,
	})
	publishTopicChanged(topicId)
}

// whether a post gives carl the chat turn: a mention of him or of everyone, or a reply to his own chat message
function isModelChatTurnPost(content: string, repliedToChatMessage: ChatRoomMessage | undefined): boolean {
	return (
		hasModelMention(content) ||
		hasAllMention(content) ||
		(repliedToChatMessage !== undefined && isModelChatMessage(repliedToChatMessage))
	)
}

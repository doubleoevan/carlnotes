// the chat room conversation state for one team topic

import {
	fetchChatRoomMessages,
	type SendChatRoomMessageOptions,
	sendChatRoomMessage,
} from "@carlnotes/client/chatRoomClient"
import type { SpokenQuestionTimings } from "@carlnotes/client/voiceClient"
import type {
	ChatRoomAttachmentRejection,
	ChatRoomMessage,
	ChatRoomMessagePage,
	RoomTopicToolCalls,
} from "@carlnotes/contracts/chat"
import { CARL_USERNAME, hasAllMention, hasModelMention, isModelChatMessage } from "@carlnotes/contracts/chatMentions"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { publishTopicChanged } from "@/stores/chatPanelStore"
import { applyTopicEditToolCalls, toastTopicToolCalls } from "./topicToolCalls"
import { useChatRoomLinkPreviews } from "./useChatRoomLinkPreviews"
import { useChatRoomSpokenAnswer } from "./useChatRoomSpokenAnswer"
import { useChatRoomStream } from "./useChatRoomStream"

// where the virtualized list numbers its first chat message before any earlier page is prepended. it
// starts very high because prepending lowers it, and it may never go below zero
export const FIRST_ITEM_INDEX_START = 1_000_000

// why a post was rejected privately to its poster: Carl's spent budget, too many files, an unreadable file, or a file
// too large to read
export type ChatRoomRejection = "budget" | ChatRoomAttachmentRejection

// what a member posts: the chat message, what it replies to, its files, and for a spoken transcript its timings
export type ChatRoomPost = Omit<SendChatRoomMessageOptions, "topicId" | "teamId"> & {
	spokenQuestionTimings?: SpokenQuestionTimings
}

export type ChatRoomState = {
	chatMessages: ChatRoomMessage[]
	isLoaded: boolean
	// true if the chat room routes answered 404, so the panel can fall back to nothing
	isRejected: boolean
	// the page the mic and the play buttons name, null while voice is off
	voiceChatPage: VoiceChatPage | null
	// why the poster's last post was rejected, shown only to that poster
	rejection: ChatRoomRejection | null
	clearRejection: () => void
	// a spent budget's rejection, which a rejected transcription shows the same way
	showBudgetRejection: () => void
	// whether carl owes the chat room an answer, for the shimmer under the chat messages
	isMessageLoading: boolean
	// resolves false when the post failed
	postChatMessage: (chatRoomPost: ChatRoomPost) => Promise<boolean>
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
		isVoiceChatConfigured,
	} = useChatMessagePages({ topicId, teamId })
	// the page the voice routes name, built once so the memoized bubbles keep one object
	const voiceChatPage = useMemo<VoiceChatPage>(() => ({ kind: "room", topicId, teamId }), [topicId, teamId])
	// carl's reply to this browser's spoken message, spoken once with its spoken question event
	const { awaitSpokenAnswer, speakPendingSpokenAnswer } = useChatRoomSpokenAnswer(voiceChatPage)
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
			speakPendingSpokenAnswer(chatMessage)
		},
		// toast the saves and the rejections for every member, then reload the topic page behind the panel
		onTopicToolCalls: (roomToolCalls) => applyChatRoomToolCalls({ roomToolCalls, topicId, userId }),
	})

	// start the wait for carl's reply, if the post gives him the chat turn
	const startModelReplyWait = (sentContent: string, replyToChatMessageId: number | null): void => {
		const repliedToChatMessage =
			replyToChatMessageId === null
				? undefined
				: chatMessages.find((knownChatMessage) => knownChatMessage.id === replyToChatMessageId)

		// a mention of him or of everyone, or a reply to his own chat message
		if (isModelChatTurnPost(sentContent, repliedToChatMessage)) {
			setIsMessageLoading(true)
		}
	}

	// the posted chat message arrives back through the stream. a spoken transcript addresses carl as a mention
	const postChatMessage = async ({
		content,
		replyToChatMessageId,
		attachments,
		isSpoken = false,
		spokenQuestionTimings,
	}: ChatRoomPost): Promise<boolean> => {
		const sentContent = isSpoken ? `@${CARL_USERNAME} ${content}` : content
		const postChatMessageResult = await sendChatRoomMessage({
			topicId,
			teamId,
			content: sentContent,
			replyToChatMessageId,
			attachments,
			isSpoken,
		}).catch(() => null)
		// too many files, an unreadable file, and a file too large to read each say so and post nothing
		if (typeof postChatMessageResult === "string") {
			setRejection(postChatMessageResult)
			return false
		}
		// a failed post says so and posts nothing
		if (postChatMessageResult === null) {
			toast("That didn't post. Try again.")
			return false
		}
		// a posted chat message may still show the budget gate's rejection in place of carl's reply
		const isModelReplyRejected = postChatMessageResult.rejectionReason !== null
		setRejection(isModelReplyRejected ? "budget" : null)
		if (spokenQuestionTimings) {
			awaitSpokenAnswer({
				chatMessageId: postChatMessageResult.chatMessageId,
				spokenQuestionTimings,
				isModelReplyRejected,
			})
		}

		// a post that gives carl the chat turn starts the wait his reply ends, unless the budget gate turned it down
		if (!isModelReplyRejected) {
			startModelReplyWait(sentContent, replyToChatMessageId)
		}
		return true
	}

	return {
		chatMessages,
		isLoaded,
		isRejected,
		voiceChatPage: isVoiceChatConfigured ? voiceChatPage : null,
		rejection,
		isMessageLoading,
		clearRejection: () => setRejection(null),
		showBudgetRejection: () => setRejection("budget"),
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
	// the list and its pages
	"chatMessages" | "loadEarlierChatMessages" | "reloadChatMessages" | "hasEarlierChatMessages" | "firstItemIndex"
> & {
	// whether voice is on, which the first page says
	isVoiceChatConfigured: boolean
	// the setter the stream and the link previews write through, and the first page's show
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
	// whether voice is on, which the first page says
	const [isVoiceChatConfigured, setIsVoiceChatConfigured] = useState(false)

	// replace the list with a first page, reset the virtual index, and read whether voice is on
	const showFirstChatMessagePage = (chatMessagePage: ChatRoomMessagePage): void => {
		setChatMessages(chatMessagePage.chatMessages)
		setHasEarlierChatMessages(chatMessagePage.hasEarlierChatMessages)
		setFirstItemIndex(FIRST_ITEM_INDEX_START)
		setIsVoiceChatConfigured(chatMessagePage.isVoiceChatConfigured)
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
		isVoiceChatConfigured,
	}
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

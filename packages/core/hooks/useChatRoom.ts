// the chat room conversation state for one team topic

import { showClientError } from "@carlnotes/client/apiClient"
import { type SendChatRoomMessageOptions, sendChatRoomMessage } from "@carlnotes/client/chatRoomClient"
import type { SpokenQuestionTimings } from "@carlnotes/client/voiceClient"
import type { ChatRoomAttachmentRejection, ChatRoomMessage, RoomTopicToolCalls } from "@carlnotes/contracts/chat"
import { CARL_USERNAME, hasAllMention, hasModelMention, isModelChatMessage } from "@carlnotes/contracts/chatMentions"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { useMemo, useRef, useState } from "react"
import { mergeChatRoomMessages } from "../lib/chatRoomMessages"
import { applyTopicEditToolCalls, showTopicToolCalls } from "../lib/topicToolCalls"
import {
	clearProposedTopicEdit,
	publishTopicChanged,
	startEditingTopic,
	toCurrentChatGuard,
} from "../stores/chatConversationStore"
import { type ChatMessagePages, useChatMessagePages } from "./useChatMessagePages"
import { useChatRoomLinkPreviews } from "./useChatRoomLinkPreviews"
import type { UseChatRoomStream } from "./useChatRoomStream"

export { FIRST_ITEM_INDEX_START } from "./useChatMessagePages"

// why a post was rejected privately to its poster: Carl's spent budget, too many files, an unreadable file, or a file
// too large to read
export type ChatRoomRejection = "budget" | ChatRoomAttachmentRejection

// what a member posts: the chat message, what it replies to, its files, and for a spoken transcript its timings
export type ChatRoomPost = Omit<SendChatRoomMessageOptions, "topicId" | "teamId"> & {
	spokenQuestionTimings?: SpokenQuestionTimings
}

export type ChatRoomState = Omit<
	ChatMessagePages,
	"setChatMessages" | "showFirstChatMessagePage" | "isVoiceChatConfigured"
> & {
	isLoaded: boolean
	// true if the chat room routes answered 404, so the panel can fall back to nothing
	isRejected: boolean
	hasLoadFailed?: boolean
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
	// the fresh chat messages with links whose link preview cards are still loading in the background
	loadingChatMessageIds: Set<number>
}

export type UseChatRoomOptions = {
	useStream: UseChatRoomStream
	onNotice?: (message: string) => void
	awaitSpokenAnswer?: (options: {
		chatMessageId: number
		spokenQuestionTimings: SpokenQuestionTimings
		isModelReplyRejected: boolean
	}) => void
	speakPendingSpokenAnswer?: (message: ChatRoomMessage) => void
	// a null topic is the team's own chat room on its team page
	topicId: string | null
	teamId: string
	userId: string | undefined
}

/**
 * Loads and updates one room through shared paging, posting and Topic-edit state.
 */
export function useChatRoom({
	topicId,
	teamId,
	userId,
	useStream,
	onNotice = showClientError,
	awaitSpokenAnswer,
	speakPendingSpokenAnswer,
}: UseChatRoomOptions): ChatRoomState {
	// track access, transient reads and rejected posts separately
	const [isLoaded, setIsLoaded] = useState(false)
	const [isRejected, setIsRejected] = useState(false)
	const [hasLoadFailed, setHasLoadFailed] = useState(false)
	const [rejection, setRejection] = useState<ChatRoomRejection | null>(null)
	// whether carl owes the chat room an answer. a send that addressed him sets it, and his reply clears it
	const [isMessageLoading, setIsMessageLoading] = useState(false)
	const pendingReplyIdRef = useRef<number | null>(null)
	const latestModelReplyIdRef = useRef(0)
	// a recovered answer ends the same wait as a live one, even if it arrived before the POST resolved
	const acceptModelReply = (message: ChatRoomMessage): void => {
		if (!isModelChatMessage(message)) {
			return
		}
		latestModelReplyIdRef.current = Math.max(latestModelReplyIdRef.current, message.id)
		if (pendingReplyIdRef.current !== null && message.id > pendingReplyIdRef.current) {
			pendingReplyIdRef.current = null
			setIsMessageLoading(false)
		}
	}

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
	} = useChatMessagePages({
		topicId,
		teamId,
		onLoaded: (page) => {
			for (const message of page.chatMessages) {
				acceptModelReply(message)
			}
			if (page.chatMessages.length === 0) {
				pendingReplyIdRef.current = null
				setIsMessageLoading(false)
			}
		},
	})
	// the page the voice routes name, built once so the memoized bubbles keep one object
	const voiceChatPage = useMemo<VoiceChatPage>(() => ({ kind: "room", topicId, teamId }), [topicId, teamId])
	// the fresh chat messages whose link preview cards are still loading in the background
	const { loadingChatMessageIds, startLinkPreviewRefresh } = useChatRoomLinkPreviews({
		topicId,
		teamId,
		setChatMessages,
	})

	// the stream owns opening, resuming, and reconnecting. this hook only says what to do with what arrives
	useStream(topicId, teamId, {
		onLoadFailed: () => setHasLoadFailed(true),
		onChatMessagesLoaded: (chatMessagePage) => {
			setHasLoadFailed(false)
			// hide the room when access is rejected
			if (chatMessagePage === null) {
				setIsRejected(true)
				setIsLoaded(true)
				return
			}
			// the first page of messages replaces the list and resets the virtual index
			setIsRejected(false)
			showFirstChatMessagePage(chatMessagePage)
			setIsLoaded(true)
		},
		onChatMessage: (chatMessage) => {
			setChatMessages((knownChatMessages) => mergeChatRoomMessages(knownChatMessages, [chatMessage]))
			// load a fresh chat message's link preview cards in the background
			startLinkPreviewRefresh(chatMessage)
			// carl's arriving chat message ends the wait his chat mention started
			acceptModelReply(chatMessage)
			speakPendingSpokenAnswer?.(chatMessage)
		},
		// toast the saves and the rejections for every member, then reload the topic page behind the panel
		onTopicToolCalls: (roomToolCalls) => applyChatRoomToolCalls({ roomToolCalls, topicId, userId, onNotice }),
	})

	// start the wait for carl's reply, if the post gives him the chat turn
	type StartModelReplyWaitOptions = { sentContent: string; replyToChatMessageId: number | null; chatMessageId: number }
	const startModelReplyWait = ({
		sentContent,
		replyToChatMessageId,
		chatMessageId,
	}: StartModelReplyWaitOptions): void => {
		const repliedToChatMessage =
			replyToChatMessageId === null
				? undefined
				: chatMessages.find((knownChatMessage) => knownChatMessage.id === replyToChatMessageId)

		// a mention of him or of everyone, or a reply to his own chat message
		if (isModelChatTurnPost(sentContent, repliedToChatMessage)) {
			const isWaiting = latestModelReplyIdRef.current < chatMessageId
			pendingReplyIdRef.current = isWaiting ? chatMessageId : null
			setIsMessageLoading(isWaiting)
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
		const isCurrentChat = toCurrentChatGuard()
		const sentContent = isSpoken ? `@${CARL_USERNAME} ${content}` : content
		const postChatMessageResult = await sendChatRoomMessage({
			topicId,
			teamId,
			content: sentContent,
			replyToChatMessageId,
			attachments,
			isSpoken,
		}).catch(() => null)
		if (!isCurrentChat()) {
			return false
		}
		// too many files, an unreadable file, and a file too large to read each say so and post nothing
		if (typeof postChatMessageResult === "string") {
			setRejection(postChatMessageResult)
			return false
		}
		// a failed post says so and posts nothing
		if (postChatMessageResult === null) {
			onNotice("That didn't post. Try again.")
			return false
		}
		// a posted chat message may still show the budget gate's rejection in place of carl's reply
		const isModelReplyRejected = postChatMessageResult.rejectionReason !== null
		setRejection(isModelReplyRejected ? "budget" : null)
		if (spokenQuestionTimings) {
			awaitSpokenAnswer?.({
				chatMessageId: postChatMessageResult.chatMessageId,
				spokenQuestionTimings,
				isModelReplyRejected,
			})
		}

		// a post that gives carl the chat turn starts the wait his reply ends, unless the budget gate turned it down
		if (!isModelReplyRejected) {
			startModelReplyWait({ sentContent, replyToChatMessageId, chatMessageId: postChatMessageResult.chatMessageId })
		}
		return true
	}

	return {
		chatMessages,
		isLoaded,
		isRejected,
		hasLoadFailed,
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

// the chat room's tool calls, the topic they changed, and the member they are shown to
type ApplyChatRoomToolCallsOptions = {
	onNotice: (message: string) => void
	roomToolCalls: RoomTopicToolCalls
	topicId: string | null
	userId: string | undefined
}

/**
 * Shows room tool results and limits proposed edits to the intended member.
 */
export function applyChatRoomToolCalls({
	roomToolCalls,
	topicId,
	userId,
	onNotice,
}: ApplyChatRoomToolCallsOptions): void {
	// show accepted and rejected saves to every member
	showTopicToolCalls({ topicToolToasts: roomToolCalls, onSaved: onNotice, onRejected: onNotice })
	if (!topicId) {
		return
	}
	// preview only for the member that carl proposed to. a save reaches everyone watching
	const isProposedToThisMember = userId !== undefined && roomToolCalls.proposedToUserId === userId
	applyTopicEditToolCalls({
		topicId,
		onStartEditingTopic: startEditingTopic,
		onClearProposedTopicEdit: clearProposedTopicEdit,
		toolCalls: {
			proposedTopicEdit: isProposedToThisMember ? roomToolCalls.proposedTopicEdit : undefined,
			isTopicEditCancelled: isProposedToThisMember && roomToolCalls.isTopicEditCancelled,
			topicSaves: roomToolCalls.topicSaves,
		},
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

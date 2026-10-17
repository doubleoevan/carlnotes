import type { ChatRoomMessage } from "@shared/contracts/chat"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import { toast } from "sonner"
import { sendDeleteChatRoomAttachment, sendDeleteChatRoomMessage } from "@/clients/chatRoomClient"
import { ModelThinkingBubble } from "@/components/chat/ChatMessageParts"
import { ScrollDownButton, useAtBottom } from "@/components/chat/ScrollDownButton.tsx"
import type { ChatRoomState } from "@/components/chat/useChatRoom"
import { useNow } from "@/hooks/useNow"
import { cn } from "@/lib/utils"
import { clearMentionedChatMessage, useChatMessageMentioned } from "@/stores/chatPanelStore"
import { ChatRoomMessageBubble } from "./ChatRoomMessageBubble"

// virtualize the chat room's chat messages past this limit
const VIRTUALIZE_FROM_CHAT_MESSAGES = 30

/**
 * The chat room's chat messages: every one through the shared author line, the user's own chat messages to the right,
 * everyone else including Carl to the left.
 */
export function ChatRoomMessages({
	chatRoom,
	userId,
	isTeamLeader,
	isAdmin,
	chatName,
	topicId,
	teamId,
	onReplyChatMessage,
	isEnlarged,
}: {
	// the conversation this list draws, which it also re-reads after removing a shared file
	chatRoom: ChatRoomState
	// whether the panel is pinned top and bottom, which lets the list fill what is left
	isEnlarged: boolean
	userId: string
	// a leader may remove any shared file, everyone else only their own
	isTeamLeader: boolean
	// an admin moderates every chat room, including teams they do not belong to
	isAdmin: boolean
	chatName: string
	// null is the team's own chat room, whose files download from the team routes
	topicId: string | null
	teamId: string
	onReplyChatMessage: (chatMessage: ChatRoomMessage) => void
}) {
	const { chatMessages, isMessageLoading, loadEarlierChatMessages, hasEarlierChatMessages, firstItemIndex } = chatRoom

	// the parent recreates these callbacks on every render, so stable wrappers let the memoized chat bubbles skip a re-render
	const handleReplyChatMessage = useStableCallback(onReplyChatMessage)
	// the stream never announces a removal. the chat messages re-read after it
	const handleDeleteAttachment = useStableCallback((attachmentId: string) => {
		void sendDeleteChatRoomAttachment(topicId, teamId, attachmentId)
			.then(() => chatRoom.reloadChatMessages())
			.catch((error) => console.error("delete chat room attachment failed", error))
	})

	// a removed chat message re-reads the same way and takes its shared files with it
	const handleDeleteChatMessage = useStableCallback((chatMessageId: number) => {
		void sendDeleteChatRoomMessage(topicId, teamId, chatMessageId)
			.then(async (isDeleted) => {
				// a toast shows what happened either way
				if (!isDeleted) {
					toast("That message could not be deleted.")
					return
				}
				await chatRoom.reloadChatMessages()
				toast("Message deleted.")
			})
			.catch((error) => {
				console.error("delete chat room chat message failed", error)
				toast("That message could not be deleted.")
			})
	})

	// one lookup table from chat message id, so a reply reference costs no scan per bubble
	const chatMessagesById = useMemo(
		() => new Map(chatMessages.map((chatMessage) => [chatMessage.id, chatMessage])),
		[chatMessages],
	)

	// one clock for every footer, ticking by the minute so the chat bubble time ago label stays up to date
	const now = useNow()

	// new chat messages keep the plain list pinned to the bottom, but only if the user is already there
	const bottomRef = useRef<HTMLDivElement>(null)
	const { isAtBottom, setIsAtBottom, handleScroll, atBottomThreshold } = useAtBottom()
	// biome-ignore lint/correctness/useExhaustiveDependencies: the counts are the scroll triggers, not values the effect reads
	useEffect(() => {
		if (isAtBottom) {
			bottomRef.current?.scrollIntoView({ block: "end" })
		}
	}, [chatMessages.length, isMessageLoading, isAtBottom])

	// the refs let one scroll handler survive every render, so it passes through the memoized chat bubbles unchanged
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	const chatMessagesRef = useRef(chatMessages)
	useLayoutEffect(() => {
		chatMessagesRef.current = chatMessages
	}, [chatMessages])

	// virtuoso offsets every index it passes to itemContent and every index it takes in scrollToIndex by the first index.
	// the scroll callbacks are made once, so they read it through a ref, never a closure
	const firstItemIndexRef = useRef(firstItemIndex)
	useLayoutEffect(() => {
		firstItemIndexRef.current = firstItemIndex
	}, [firstItemIndex])

	// switching chat rooms starts a different list, so the note starts over with it
	// biome-ignore lint/correctness/useExhaustiveDependencies: the room is the trigger, not a value the effect reads
	useEffect(() => {
		setIsMentionedChatMessageMissing(false)
	}, [topicId, teamId])

	// the chat room message a mention badge is trying to load, and whether the search for it ran out of pages
	const chatMessageMentioned = useChatMessageMentioned()
	const [isMentionedChatMessageMissing, setIsMentionedChatMessageMissing] = useState(false)

	// the jump down to the latest chat message
	const scrollToLatestChatMessage = useCallback(() => {
		virtuosoRef.current?.scrollToIndex({
			index: firstItemIndexRef.current + chatMessagesRef.current.length - 1,
			align: "end",
		})
		bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
	}, [])

	// the reply quote scrolls up to the chat message it answers
	const scrollToChatMessage = useCallback((chatMessageId: number) => {
		// the plain list scrolls up to the chat bubble's element
		const currentChatMessages = chatMessagesRef.current
		if (currentChatMessages.length < VIRTUALIZE_FROM_CHAT_MESSAGES) {
			document.getElementById(`room-message-${chatMessageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
			return
		}

		// the virtualized list scrolls by index, because the target chat bubble may not be mounted
		const repliedChatMessageIndex = currentChatMessages.findIndex((chatMessage) => chatMessage.id === chatMessageId)
		if (repliedChatMessageIndex >= 0) {
			virtuosoRef.current?.scrollToIndex({
				index: firstItemIndexRef.current + repliedChatMessageIndex,
				align: "center",
				behavior: "smooth",
			})
		}
	}, [])

	// load the chat message that a mention named: scroll to it when it is loaded, load the page above when it is
	// not, and stop when the room has no more pages to search
	useEffect(() => {
		if (chatMessageMentioned === null || chatMessages.length === 0) {
			return
		}
		if (chatMessages.some((chatMessage) => chatMessage.id === chatMessageMentioned)) {
			clearMentionedChatMessage()
			setIsMentionedChatMessageMissing(false)
			scrollToChatMessage(chatMessageMentioned)
			return
		}
		if (!hasEarlierChatMessages) {
			clearMentionedChatMessage()
			setIsMentionedChatMessageMissing(true)
			return
		}
		void loadEarlierChatMessages()
	}, [chatMessageMentioned, chatMessages, hasEarlierChatMessages, loadEarlierChatMessages, scrollToChatMessage])

	// shown when the jump reached the room's first chat message without finding the one the badge named
	const missingChatMessageNotice = isMentionedChatMessageMissing ? (
		<p className="text-muted-foreground px-3 pb-1 text-center text-xs">That message is no longer in this chat room.</p>
	) : null

	// answering the chat message directly above needs no quote, only a reply to an earlier chat message needs one
	const toRepliedChatMessage = (chatMessage: ChatRoomMessage, index: number): ChatRoomMessage | undefined =>
		chatMessage.replyToChatMessageId === null || chatMessage.replyToChatMessageId === chatMessages[index - 1]?.id
			? undefined
			: chatMessagesById.get(chatMessage.replyToChatMessageId)

	// one chat bubble with its props, shared by the plain and virtualized paths
	const renderChatMessageBubble = (chatMessage: ChatRoomMessage, index: number) => (
		<ChatRoomMessageBubble
			chatMessage={chatMessage}
			topicId={topicId}
			teamId={teamId}
			canDelete={isTeamLeader || isAdmin || chatMessage.authorUserId === userId}
			isLinkPreviewLoading={chatRoom.loadingChatMessageIds.has(chatMessage.id)}
			voiceChatPage={chatRoom.voiceChatPage}
			onAttachmentDelete={handleDeleteAttachment}
			repliedChatMessage={toRepliedChatMessage(chatMessage, index)}
			isOwnChatMessage={chatMessage.authorUserId === userId}
			now={now}
			onReply={handleReplyChatMessage}
			onQuoteClick={scrollToChatMessage}
			onDeleteChatMessage={handleDeleteChatMessage}
		/>
	)

	// the footer object keeps one reference per thinking state, so virtuoso does not remount it every render
	const virtuosoComponents = useMemo(
		() => ({ Footer: isMessageLoading ? VirtualizedThinkingFooter : undefined }),
		[isMessageLoading],
	)

	// past many chat messages the list virtualizes, and the thinking shimmer shows below it as the footer
	if (chatMessages.length >= VIRTUALIZE_FROM_CHAT_MESSAGES) {
		return (
			// the virtualizer has no natural height of its own
			<div
				className={cn(
					"animate-in fade-in relative min-h-0 duration-200",
					isEnlarged ? "flex-1" : "h-[38dvh] grow sm:h-[55dvh]",
				)}
			>
				<Virtuoso
					className="overscroll-contain"
					ref={virtuosoRef}
					data={chatMessages}
					computeItemKey={(_, chatMessage) => chatMessage.id}
					firstItemIndex={firstItemIndex}
					startReached={hasEarlierChatMessages ? () => void loadEarlierChatMessages() : undefined}
					initialTopMostItemIndex={{ index: "LAST", align: "end" }}
					followOutput="auto"
					components={virtuosoComponents}
					atBottomStateChange={setIsAtBottom}
					atBottomThreshold={atBottomThreshold}
					itemContent={(index, chatMessage) => (
						<div className="px-3 py-2">{renderChatMessageBubble(chatMessage, index - firstItemIndex)}</div>
					)}
				/>
				{missingChatMessageNotice}
				<ScrollDownButton isScrollDownShown={!isAtBottom} onScrollDown={scrollToLatestChatMessage} />
			</div>
		)
	}

	return (
		<div className="animate-in fade-in relative flex min-h-0 flex-1 flex-col duration-200">
			<div
				onScroll={handleScroll}
				className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3 wrap-anywhere"
			>
				{chatMessages.length === 0 && (
					<p className="text-muted-foreground px-1 py-6 text-center text-sm">
						{`Join the conversation, or ask @carl for a hot take on ${chatName || "this chat"}.`}
					</p>
				)}
				{chatMessages.map((chatMessage, index) => (
					<div key={chatMessage.id} id={`room-message-${chatMessage.id}`}>
						{renderChatMessageBubble(chatMessage, index)}
					</div>
				))}
				{isMessageLoading && <ModelThinkingBubble />}
				<div ref={bottomRef} />
			</div>
			{missingChatMessageNotice}
			<ScrollDownButton isScrollDownShown={!isAtBottom} onScrollDown={scrollToLatestChatMessage} />
		</div>
	)
}

// the thinking shimmer below the virtualized chat messages
function VirtualizedThinkingFooter() {
	return (
		<div className="px-3 pb-3">
			<ModelThinkingBubble />
		</div>
	)
}

// wraps a callback the parent recreates every render in one function whose identity never changes
function useStableCallback<Args extends unknown[]>(callback: (...args: Args) => void): (...args: Args) => void {
	// the ref keeps the latest callback while the returned function stays the same, updated after the render commits
	const callbackRef = useRef(callback)
	useLayoutEffect(() => {
		callbackRef.current = callback
	}, [callback])
	return useCallback((...args: Args) => callbackRef.current(...args), [])
}

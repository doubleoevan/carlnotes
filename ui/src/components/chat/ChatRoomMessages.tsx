import { isModelChatMessage } from "@shared/chatMentions"
import type { ChatRoomMessage } from "@shared/contracts"
import { FileText, Film, Image, Paperclip, Reply, Trash2, X } from "lucide-react"
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import { toast } from "sonner"
import {
	sendDeleteChatRoomAttachment,
	sendDeleteChatRoomMessage,
	toChatRoomAttachmentUrl,
} from "@/clients/chatRoomClient"
import { ChatAuthor } from "@/components/chat/ChatAuthor"
import { ChatMarkdown } from "@/components/chat/ChatMarkdown"
import { ChatVideo, CopyButton, ModelThinkingBubble, toTimeAgoLabel } from "@/components/chat/ChatMessages"
import { ScrollDownButton, useAtBottom } from "@/components/chat/ScrollDownButton.tsx"
import type { ChatRoomState } from "@/components/chat/useChatRoom"
import { LinkPreviewCard, LinkPreviewLoading } from "@/components/common/LinkPreviewCard"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { useNow } from "@/hooks/useNow"
import { cn } from "@/lib/utils"

// virtualize the chat room's chat messages past this limit
const VIRTUALIZE_FROM_CHAT_MESSAGES = 30

// the icon each shared file kind shows beside its name
const ATTACHMENT_KIND_ICONS = { image: Image, pdf: FileText, text: Paperclip, video: Film } as const

/**
 * The chat room's chat messages: every one through the shared author line, the user's own chat messages to the right,
 * everyone else including Carl to the left.
 */
export function ChatRoomMessages({
	chatRoom,
	userId,
	isLeader,
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
	isLeader: boolean
	// an admin moderates every chat room, including teams they do not belong to
	isAdmin: boolean
	chatName: string
	// null is the team's own chat room, whose files download from the team routes
	topicId: string | null
	teamId: string
	onReplyChatMessage: (chatMessage: ChatRoomMessage) => void
}) {
	const { chatMessages, isMessageLoading } = chatRoom

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
				// a toast says what happened either way
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

	// the jump down to the newest chat message from either list
	const scrollToLatest = useCallback(() => {
		virtuosoRef.current?.scrollToIndex({ index: chatMessagesRef.current.length - 1, align: "end" })
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
			virtuosoRef.current?.scrollToIndex({ index: repliedChatMessageIndex, align: "center", behavior: "smooth" })
		}
	}, [])

	// answering the chat message directly above needs no quote, only a reply to an earlier chat message needs one
	const toRepliedTo = (chatMessage: ChatRoomMessage, index: number): ChatRoomMessage | undefined =>
		chatMessage.replyToChatMessageId === null || chatMessage.replyToChatMessageId === chatMessages[index - 1]?.id
			? undefined
			: chatMessagesById.get(chatMessage.replyToChatMessageId)

	// one chat bubble with its props, shared by the plain and virtualized paths
	const renderBubble = (chatMessage: ChatRoomMessage, index: number) => (
		<ChatRoomMessageBubble
			chatMessage={chatMessage}
			topicId={topicId}
			teamId={teamId}
			canDelete={isLeader || isAdmin || chatMessage.authorUserId === userId}
			isLinkPreviewLoading={chatRoom.loadingChatMessageIds.has(chatMessage.id)}
			onAttachmentDelete={handleDeleteAttachment}
			repliedTo={toRepliedTo(chatMessage, index)}
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
					initialTopMostItemIndex={chatMessages.length - 1}
					followOutput="auto"
					components={virtuosoComponents}
					atBottomStateChange={setIsAtBottom}
					atBottomThreshold={atBottomThreshold}
					itemContent={(index, chatMessage) => <div className="px-3 py-2">{renderBubble(chatMessage, index)}</div>}
				/>
				<ScrollDownButton isScrollDownShown={!isAtBottom} onScrollDown={scrollToLatest} />
			</div>
		)
	}

	return (
		<div className="animate-in fade-in relative flex min-h-24 flex-1 flex-col duration-200">
			<div onScroll={handleScroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3">
				{chatMessages.length === 0 && (
					<p className="text-muted-foreground px-1 py-6 text-center text-sm">
						{`Join the conversation, or ask @carl for a hot take on ${chatName || "this chat"}.`}
					</p>
				)}
				{chatMessages.map((chatMessage, index) => (
					<div key={chatMessage.id} id={`room-message-${chatMessage.id}`}>
						{renderBubble(chatMessage, index)}
					</div>
				))}
				{isMessageLoading && <ModelThinkingBubble />}
				<div ref={bottomRef} />
			</div>
			<ScrollDownButton isScrollDownShown={!isAtBottom} onScrollDown={scrollToLatest} />
		</div>
	)
}

// one chat message: the author line, the reply reference when there is one, the chat bubble, and the footer
const ChatRoomMessageBubble = memo(function ChatRoomMessageBubble({
	chatMessage,
	topicId,
	teamId,
	repliedTo,
	isOwnChatMessage,
	now,
	canDelete,
	isLinkPreviewLoading,
	onReply,
	onQuoteClick,
	onAttachmentDelete,
	onDeleteChatMessage,
}: {
	chatMessage: ChatRoomMessage
	// null is the team's own chat room, whose files download from the team routes
	topicId: string | null
	teamId: string
	repliedTo: ChatRoomMessage | undefined
	isOwnChatMessage: boolean
	now: number
	// the chat message's author and a team leader may remove it and its shared files
	canDelete: boolean
	// true while this fresh chat message's link preview cards are still loading
	isLinkPreviewLoading: boolean
	onReply: (chatMessage: ChatRoomMessage) => void
	// scrolls the chat messages back to the quoted chat message
	onQuoteClick: (chatMessageId: number) => void
	onAttachmentDelete: (attachmentId: string) => void
	onDeleteChatMessage: (chatMessageId: number) => void
}) {
	// carl's answers are Markdown from the model. everyone else's words render as written
	const isModel = isModelChatMessage(chatMessage)
	return (
		<ChatAuthor
			authorUserId={chatMessage.authorUserId}
			authorUsername={chatMessage.authorUsername}
			avatarSource={chatMessage.authorAvatarSource}
			isOwnChatMessage={isOwnChatMessage}
		>
			<div className={cn("group flex flex-col", isOwnChatMessage ? "items-end" : "items-start")}>
				{/* the reference quotes what this chat message answers, and clicking it scrolls back up to it */}
				{repliedTo && (
					<button
						type="button"
						onClick={() => onQuoteClick(repliedTo.id)}
						className="text-muted-foreground bg-bubble/60 border-border mb-0.5 max-w-[92%] rounded-lg border-l-2 px-2.5 py-1 text-left text-xs @lg:max-w-[75%]"
					>
						<span className="flex items-center gap-1">
							<Reply className="size-3" />
							{repliedTo.authorUsername}
						</span>
						<span className="mt-0.5 line-clamp-3 block">{repliedTo.content}</span>
					</button>
				)}
				<div
					className={cn(
						"max-w-[92%] rounded-2xl px-3.5 py-2 text-sm @lg:max-w-[75%]",
						isOwnChatMessage
							? "bg-primary text-primary-foreground rounded-br-sm"
							: "bg-bubble text-foreground rounded-bl-sm",
					)}
				>
					{isModel ? (
						<ChatMarkdown markdown={chatMessage.content} />
					) : (
						<p className="whitespace-pre-wrap">{chatMessage.content}</p>
					)}
				</div>

				{/* the cards for the chat message's first links */}
				{chatMessage.linkPreviews.map((linkPreview) => (
					<LinkPreviewCard key={linkPreview.url} linkPreview={linkPreview} />
				))}
				{isLinkPreviewLoading && chatMessage.linkPreviews.length === 0 && <LinkPreviewLoading />}

				{/* the shared attachment files. an image or a clip shows itself above its row, every kind keeps the row */}
				{chatMessage.attachments.map((attachment) => {
					const KindIcon = ATTACHMENT_KIND_ICONS[attachment.kind]
					return (
						<div key={attachment.id} className="mt-1">
							{attachment.kind === "image" && <SharedImage attachment={attachment} topicId={topicId} teamId={teamId} />}
							{attachment.kind === "video" && (
								<ChatVideo src={toChatRoomAttachmentUrl(topicId, teamId, attachment.id)} name={attachment.name} />
							)}
							<div className="text-muted-foreground flex items-center gap-1.5 text-xs">
								<KindIcon className="size-3" />
								<a
									href={toChatRoomAttachmentUrl(topicId, teamId, attachment.id)}
									download={attachment.name}
									className="hover:text-foreground max-w-56 truncate underline-offset-2 hover:underline"
								>
									{attachment.name}
								</a>
								{canDelete && (
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												aria-label={`Delete ${attachment.name}`}
												onClick={() => onAttachmentDelete(attachment.id)}
												className="hover:text-foreground"
											>
												<X className="size-3" />
											</button>
										</TooltipTrigger>
										<TooltipContent>
											Delete <span className="font-semibold">{attachment.name}</span>
										</TooltipContent>
									</Tooltip>
								)}
							</div>
						</div>
					)
				})}
				{/* the footer shows the time ago, the reply button, and the copy button */}
				<div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
					<span>{toTimeAgoLabel(new Date(chatMessage.createdAt).getTime(), now)}</span>
					<button
						type="button"
						onClick={() => onReply(chatMessage)}
						className="hover:text-foreground flex items-center gap-1"
					>
						<Reply className="size-3" />
						Reply
					</button>
					<CopyButton text={chatMessage.content} />
					{/* the author or a leader or an admin can remove the chat message, which takes its shared files with it */}
					{canDelete && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label="Delete message"
									onClick={() => onDeleteChatMessage(chatMessage.id)}
									className="hover:text-foreground flex items-center"
								>
									<Trash2 className="size-3" />
								</button>
							</TooltipTrigger>
							<TooltipContent>Delete chatMessage</TooltipContent>
						</Tooltip>
					)}
				</div>
			</div>
		</ChatAuthor>
	)
})

/**
 * A shared image, shown in place at a size that keeps the bubble readable. Clicking on it opens the full file.
 */
function SharedImage({
	attachment,
	topicId,
	teamId,
}: {
	attachment: ChatRoomMessage["attachments"][number]
	topicId: string | null
	teamId: string
}) {
	// a plain anchor. the router would take an /api path as one of its own routes
	const imageUrl = toChatRoomAttachmentUrl(topicId, teamId, attachment.id)
	return (
		<a href={imageUrl} target="_blank" rel="noopener noreferrer" className="mb-1 block w-fit">
			<img
				src={imageUrl}
				alt={attachment.name}
				loading="lazy"
				decoding="async"
				className="max-h-60 max-w-full rounded-lg object-contain"
			/>
		</a>
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

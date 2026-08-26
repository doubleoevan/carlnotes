import { isCarlMessage } from "@shared/chatMentions"
import type { ChatRoomMessage } from "@shared/contracts"
import { FileText, Image, Paperclip, Reply, X } from "lucide-react"
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import { toChatRoomAttachmentUrl } from "@/clients/chatRoomClient"
import { ChatAuthor } from "@/components/chat/ChatAuthor"
import { ChatMarkdown } from "@/components/chat/ChatMarkdown"
import { CarlThinkingBubble, CopyButton, toTimeAgoLabel } from "@/components/chat/ChatMessages"
import { ScrollDownButton, useAtBottom } from "@/components/chat/ScrollDownButton.tsx"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { useNow } from "@/hooks/useNow"
import { cn } from "@/lib/utils"

// virtualize the room's chat messages past this limit
const VIRTUALIZE_FROM_MESSAGES = 30

/**
 * The team room's chat messages: every one through the shared author line, the user's own messages to the right,
 * everyone else including Carl to the left.
 */
export function ChatRoomMessages({
	messages,
	userId,
	isLeader,
	isCarlThinking,
	topicName,
	topicId,
	teamId,
	onReplyMessage,
	onDeleteAttachment,
	isEnlarged,
}: {
	messages: ChatRoomMessage[]
	// whether the panel is pinned top and bottom, which lets the list fill what is left
	isEnlarged: boolean
	userId: string
	// whether carl owes the room an answer, drawn as the same shimmer the private chat shows
	isCarlThinking: boolean
	// a leader may remove any shared file, everyone else only their own
	isLeader: boolean
	topicName: string
	// null is the team's own room, whose files download from the team routes
	topicId: string | null
	teamId: string
	onReplyMessage: (message: ChatRoomMessage) => void
	onDeleteAttachment: (attachmentId: string) => void
}) {
	// the parent recreates these callbacks on every render, so stable wrappers let the memoized chat bubbles skip a re-render
	const handleReplyMessage = useStableCallback(onReplyMessage)
	const handleDeleteAttachment = useStableCallback(onDeleteAttachment)

	// one lookup table from message id, so a reply reference costs no scan per bubble
	const messagesById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages])

	// one clock for every footer, ticking by the minute so the chat bubble time ago label stays up to date
	const now = useNow()

	// new messages keep the plain list pinned to the bottom, but only if the user is already there
	const bottomRef = useRef<HTMLDivElement>(null)
	const { isAtBottom, setIsAtBottom, handleScroll, atBottomThreshold } = useAtBottom()
	// biome-ignore lint/correctness/useExhaustiveDependencies: the counts are the scroll triggers, not values the effect reads
	useEffect(() => {
		if (isAtBottom) {
			bottomRef.current?.scrollIntoView({ block: "end" })
		}
	}, [messages.length, isCarlThinking, isAtBottom])

	// the refs let one scroll handler survive every render, so it passes through the memoized chat bubbles unchanged
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	const messagesRef = useRef(messages)
	useLayoutEffect(() => {
		messagesRef.current = messages
	}, [messages])

	// the jump down to the newest message from either list
	const scrollToLatest = useCallback(() => {
		virtuosoRef.current?.scrollToIndex({ index: messagesRef.current.length - 1, align: "end" })
		bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
	}, [])

	// the reply quote scrolls up to the message it answers
	const scrollToMessage = useCallback((messageId: number) => {
		// the plain list scrolls up to the chat bubble's element
		const repliedMessage = messagesRef.current
		if (repliedMessage.length < VIRTUALIZE_FROM_MESSAGES) {
			document.getElementById(`room-message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
			return
		}

		// the virtualized list scrolls by index, because the target chat bubble may not be mounted
		const repliedMessageIndex = repliedMessage.findIndex((message) => message.id === messageId)
		if (repliedMessageIndex >= 0) {
			virtuosoRef.current?.scrollToIndex({ index: repliedMessageIndex, align: "center", behavior: "smooth" })
		}
	}, [])

	// answering the message directly above needs no quote, only a reply to an earlier message needs one
	const toRepliedTo = (message: ChatRoomMessage, index: number): ChatRoomMessage | undefined =>
		message.replyToMessageId === null || message.replyToMessageId === messages[index - 1]?.id
			? undefined
			: messagesById.get(message.replyToMessageId)

	// one chat bubble with its props, shared by the plain and virtualized paths
	const renderBubble = (message: ChatRoomMessage, index: number) => (
		<ChatRoomMessageBubble
			message={message}
			topicId={topicId}
			teamId={teamId}
			canDeleteAttachment={isLeader || message.authorUserId === userId}
			onAttachmentDelete={handleDeleteAttachment}
			repliedTo={toRepliedTo(message, index)}
			isOwnMessage={message.authorUserId === userId}
			now={now}
			onReply={handleReplyMessage}
			onQuoteClick={scrollToMessage}
		/>
	)

	// the footer object keeps one reference per thinking state, so virtuoso does not remount it every render
	const virtuosoComponents = useMemo(
		() => ({ Footer: isCarlThinking ? VirtualizedThinkingFooter : undefined }),
		[isCarlThinking],
	)

	// past many chat messages the list virtualizes, and the thinking shimmer shows below it as the footer
	if (messages.length >= VIRTUALIZE_FROM_MESSAGES) {
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
					data={messages}
					computeItemKey={(_, message) => message.id}
					initialTopMostItemIndex={messages.length - 1}
					followOutput="auto"
					components={virtuosoComponents}
					atBottomStateChange={setIsAtBottom}
					atBottomThreshold={atBottomThreshold}
					itemContent={(index, message) => <div className="px-3 py-2">{renderBubble(message, index)}</div>}
				/>
				<ScrollDownButton isScrollDownShown={!isAtBottom} onScrollDown={scrollToLatest} />
			</div>
		)
	}

	return (
		<div className="animate-in fade-in relative flex min-h-24 flex-1 flex-col duration-200">
			<div onScroll={handleScroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3">
				{messages.length === 0 && (
					<p className="text-muted-foreground px-1 py-6 text-center text-sm">
						{`Join the conversation, or ask @carl for a hot take on ${topicName || "this topic"}.`}
					</p>
				)}
				{messages.map((message, index) => (
					<div key={message.id} id={`room-message-${message.id}`}>
						{renderBubble(message, index)}
					</div>
				))}
				{isCarlThinking && <CarlThinkingBubble />}
				<div ref={bottomRef} />
			</div>
			<ScrollDownButton isScrollDownShown={!isAtBottom} onScrollDown={scrollToLatest} />
		</div>
	)
}

// one message: the author line, the reply reference when there is one, the chat bubble, and the footer
const ChatRoomMessageBubble = memo(function ChatRoomMessageBubble({
	message,
	topicId,
	teamId,
	repliedTo,
	isOwnMessage,
	now,
	canDeleteAttachment,
	onReply,
	onQuoteClick,
	onAttachmentDelete,
}: {
	message: ChatRoomMessage
	// null is the team's own room, whose files download from the team routes
	topicId: string | null
	teamId: string
	repliedTo: ChatRoomMessage | undefined
	isOwnMessage: boolean
	now: number
	canDeleteAttachment: boolean
	onReply: (message: ChatRoomMessage) => void
	// scrolls the chat messages back to the quoted message
	onQuoteClick: (messageId: number) => void
	onAttachmentDelete: (attachmentId: string) => void
}) {
	// carl's answers are Markdown from the model. everyone else's words render as written
	const isCarl = isCarlMessage(message)
	return (
		<ChatAuthor
			authorUserId={message.authorUserId}
			authorUsername={message.authorUsername}
			avatarSource={message.authorAvatarSource}
			isOwnMessage={isOwnMessage}
		>
			<div className={cn("group flex flex-col", isOwnMessage ? "items-end" : "items-start")}>
				{/* the reference quotes what this message answers, and clicking it scrolls back up to it */}
				{repliedTo && (
					<button
						type="button"
						onClick={() => onQuoteClick(repliedTo.id)}
						className="text-muted-foreground bg-bubble/60 border-border mb-0.5 max-w-[92%] rounded-lg border-l-2 px-2.5 py-1 text-left text-xs lg:max-w-[36rem]"
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
						"max-w-[92%] rounded-2xl px-3.5 py-2 text-sm lg:max-w-[36rem]",
						isOwnMessage
							? "bg-primary text-primary-foreground rounded-br-sm"
							: "bg-bubble text-foreground rounded-bl-sm",
					)}
				>
					{isCarl ? (
						<ChatMarkdown markdown={message.content} />
					) : (
						<p className="whitespace-pre-wrap">{message.content}</p>
					)}
				</div>

				{/* the shared attachment files, one row each. a name downloads it, and whoever may remove it gets the X */}
				{message.attachments.map((attachment) => (
					<div key={attachment.id} className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
						{attachment.kind === "image" ? (
							<Image className="size-3" />
						) : attachment.kind === "pdf" ? (
							<FileText className="size-3" />
						) : (
							<Paperclip className="size-3" />
						)}
						<a
							href={toChatRoomAttachmentUrl(topicId, teamId, attachment.id)}
							download={attachment.name}
							className="hover:text-foreground max-w-56 truncate underline-offset-2 hover:underline"
						>
							{attachment.name}
						</a>
						{canDeleteAttachment && (
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
				))}
				{/* the footer shows the time ago, the reply button, and the copy button */}
				<div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
					<span>{toTimeAgoLabel(new Date(message.createdAt).getTime(), now)}</span>
					<button
						type="button"
						onClick={() => onReply(message)}
						className="hover:text-foreground flex items-center gap-1"
					>
						<Reply className="size-3" />
						Reply
					</button>
					<CopyButton text={message.content} />
				</div>
			</div>
		</ChatAuthor>
	)
})

// the thinking shimmer below the virtualized chat messages
function VirtualizedThinkingFooter() {
	return (
		<div className="px-3 pb-3">
			<CarlThinkingBubble />
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

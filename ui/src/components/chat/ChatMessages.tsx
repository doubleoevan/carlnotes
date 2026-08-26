import { CHAT_HISTORY_TURNS, toUncompactedChatTurnStart } from "@shared/contracts"
import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import type { ChatRejection } from "@/clients/chatClient"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { ChatAuthor } from "@/components/chat/ChatAuthor"
import { ChatBudgetNotice } from "@/components/chat/ChatBudgetNotice"
import { ChatMarkdown } from "@/components/chat/ChatMarkdown"
import { ScrollDownButton, useAtBottom } from "@/components/chat/ScrollDownButton.tsx"
import { randomThinkingLine } from "@/components/chat/thinkingLines"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { useNow } from "@/hooks/useNow"
import { cn } from "@/lib/utils"

// one chat turn in the message list
export type ChatTurn = { question: string; answer: string; rejection: ChatRejection | null; at?: number }

// virtualize the chat messages window after this many turns
const VIRTUALIZE_FROM_CHAT_TURNS = 30

// who a chat message renders as: the account when one exists, and the recorded name either way
export type ChatMessageAuthor = { userId: string | null; username: string; avatarSource: string | null }

/**
 * The scrollable message list. It starts short and grows with the conversation, then it scrolls inside its own box.
 */
export function ChatMessages({
	chatTurns,
	isStreaming,
	topicName,
	isBudgetExhausted,
	author,
	onRetry,
	isEnlarged,
}: {
	chatTurns: ChatTurn[]
	isStreaming: boolean
	// whether the panel expands to fill the screen
	isEnlarged: boolean
	topicName: string
	// a conversation with no turns left in the budget does not show an input to add more
	isBudgetExhausted?: boolean
	// the current user
	author: ChatMessageAuthor
	// re-asks a failed turn's question on the failure notice
	onRetry?: (question: string) => void
}) {
	// one scroll handle per list
	const bottomRef = useRef<HTMLDivElement>(null)
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	// use a ref to check whether the message list is at the bottom
	const isAtBottomRef = useRef(false)

	// whether the user is at the newest chat turn or has scrolled up from it
	const { isAtBottom, setIsAtBottom, handleScroll, atBottomThreshold } = useAtBottom()

	// a clock to share for every footer's relative time, ticking once a minute
	const now = useNow()

	// keep the newest chat turn in view while the reply streams, but only for a user who is already at the bottom
	const newestAnswerLength = chatTurns.at(-1)?.answer.length ?? 0
	// biome-ignore lint/correctness/useExhaustiveDependencies: the counts are scroll triggers, not values the effect reads
	useEffect(() => {
		if (!isAtBottom) {
			return
		}
		// the initial scroll to the bottom is instant
		const isInitialScroll = !isAtBottomRef.current
		isAtBottomRef.current = true
		bottomRef.current?.scrollIntoView({
			behavior: isInitialScroll || isStreaming ? "auto" : "smooth",
			block: "end",
		})
	}, [chatTurns.length, newestAnswerLength, isStreaming, isAtBottom])

	// jump back to the newest chat turn, instantly instead of smooth scroll, when the user clicks the scroll to latest button
	function scrollToLatest(): void {
		virtuosoRef.current?.scrollToIndex({ index: chatTurns.length - 1, align: "end" })
		bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
	}

	// what we send to the model without compacting
	const historyStart = Math.max(0, chatTurns.length - CHAT_HISTORY_TURNS)
	const uncompactedChatTurnStart = historyStart + toUncompactedChatTurnStart(chatTurns.slice(-CHAT_HISTORY_TURNS))

	// past a long conversation window, the message list virtualizes
	if (chatTurns.length >= VIRTUALIZE_FROM_CHAT_TURNS) {
		return (
			// the virtualizer has no natural height of its own
			<div className={cn("relative min-h-0", isEnlarged ? "flex-1" : "h-[38dvh] grow sm:h-[55dvh]")}>
				<Virtuoso
					className="overscroll-contain"
					ref={virtuosoRef}
					data={chatTurns}
					initialTopMostItemIndex={chatTurns.length - 1}
					followOutput="auto"
					atBottomStateChange={setIsAtBottom}
					atBottomThreshold={atBottomThreshold}
					itemContent={(index, chatTurn) => (
						<div className="px-3 py-2">
							<ChatTurnBlock
								chatTurn={chatTurn}
								index={index}
								uncompactedChatTurnStart={uncompactedChatTurnStart}
								isLast={index === chatTurns.length - 1}
								isStreaming={isStreaming}
								now={now}
								author={author}
								onRetry={onRetry}
							/>
						</div>
					)}
				/>
				<ScrollDownButton isScrollDownShown={!isAtBottom} onScrollDown={scrollToLatest} />
			</div>
		)
	}

	return (
		<div className="relative flex min-h-24 flex-1 flex-col">
			<div onScroll={handleScroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3">
				{chatTurns.length === 0 && !isBudgetExhausted && <ChatInputPlaceholder topicName={topicName} />}
				{chatTurns.map((chatTurn, index) => (
					<ChatTurnBlock
						// biome-ignore lint/suspicious/noArrayIndexKey: chat turns are append-only and never reordered
						key={index}
						chatTurn={chatTurn}
						index={index}
						author={author}
						uncompactedChatTurnStart={uncompactedChatTurnStart}
						isLast={index === chatTurns.length - 1}
						isStreaming={isStreaming}
						now={now}
					/>
				))}
				<div ref={bottomRef} />
			</div>
			<ScrollDownButton isScrollDownShown={!isAtBottom} onScrollDown={scrollToLatest} />
		</div>
	)
}

// one chat turn as the message list renders it. the compaction line comes above the uncompacted chat turn if it exists
function ChatTurnBlock({
	chatTurn,
	index,
	uncompactedChatTurnStart,
	isLast,
	isStreaming,
	now,
	author,
	onRetry,
}: {
	chatTurn: ChatTurn
	index: number
	uncompactedChatTurnStart: number
	isLast: boolean
	isStreaming: boolean
	now: number
	author: ChatMessageAuthor
	onRetry?: (question: string) => void
}) {
	return (
		<div className="space-y-3">
			{uncompactedChatTurnStart > 0 && index === uncompactedChatTurnStart && <CompactionNotice />}
			<QuestionBubble chatTurn={chatTurn} now={now} author={author} />
			<AnswerBubble chatTurn={chatTurn} isLast={isLast} isStreaming={isStreaming} now={now} onRetry={onRetry} />
		</div>
	)
}

/**
 * Formats the label for how long ago a chat turn finished, from "just now" through minutes, hours, and days.
 */
export function toTimeAgoLabel(at: number, now: number): string {
	// under a minute reads as just now, then minutes take over
	const elapsedMs = Math.max(0, now - at)
	const minutes = Math.floor(elapsedMs / 60_000)
	if (minutes < 1) {
		return "just now"
	}
	if (minutes < 60) {
		return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`
	}

	// hours label the rest of the day, then days
	const hours = Math.floor(minutes / 60)
	if (hours < 24) {
		return hours === 1 ? "1 hour ago" : `${hours} hours ago`
	}
	const days = Math.floor(hours / 24)
	return days === 1 ? "1 day ago" : `${days} days ago`
}

// the divider marking where the model's compaction ends
function CompactionNotice() {
	return (
		<div className="flex items-center gap-2 py-1">
			<div className="border-separator flex-1 border-t" />
			<p className="shimmer-text text-center text-xs">
				{"Carl has a lot on his mind. Everything above got summarized."}
			</p>
			<div className="border-separator flex-1 border-t" />
		</div>
	)
}

// the placeholder line for an empty conversation, naming the topic
function ChatInputPlaceholder({ topicName }: { topicName: string }) {
	return (
		<p className="text-muted-foreground py-2 text-sm">{`Ask me for a hot take on ${topicName || "this topic"}.`}</p>
	)
}

// the user's own question to the right, with their avatar and name like every message
function QuestionBubble({ chatTurn, now, author }: { chatTurn: ChatTurn; now: number; author: ChatMessageAuthor }) {
	return (
		<ChatAuthor
			authorUserId={author.userId}
			authorUsername={author.username}
			avatarSource={author.avatarSource}
			isOwnMessage
		>
			<div className="group flex flex-col items-end">
				<p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm whitespace-pre-wrap lg:max-w-[36rem]">
					{chatTurn.question}
				</p>
				{/* the footer shows the time ago and copy button to the right */}
				<div className="text-muted-foreground -mr-1 mt-1 flex items-center gap-2 text-xs">
					{chatTurn.at !== undefined && <span>{toTimeAgoLabel(chatTurn.at, now)}</span>}
					<CopyButton text={chatTurn.question} />
				</div>
			</div>
		</ChatAuthor>
	)
}

// the llm reply on the left. it shows the CoffeeMug and thinking message shimmer before the response starts streaming.
function AnswerBubble({
	chatTurn,
	isLast,
	isStreaming,
	now,
	onRetry,
}: {
	chatTurn: ChatTurn
	isLast: boolean
	isStreaming: boolean
	now: number
	// re-asks a failed turn's question, offered on the failure notice
	onRetry?: (question: string) => void
}) {
	// the two live states, waiting while showing the thinking message and streaming the response
	const isWaitingForAnswer = isLast && isStreaming && chatTurn.answer === ""
	const isStreamingAnswer = isLast && isStreaming && chatTurn.answer !== ""
	if (isWaitingForAnswer && !chatTurn.rejection) {
		return <CarlThinkingBubble />
	}

	// a rejected chat turn shows the failure or a call to action instead of an empty bubble
	if (chatTurn.rejection) {
		return (
			<ChatRejectionNotice rejection={chatTurn.rejection} onRetry={onRetry && (() => onRetry(chatTurn.question))} />
		)
	}

	return (
		<ChatAuthor authorUserId={null} authorUsername="Carl">
			<div className="group flex flex-col items-start">
				<div className="bg-bubble text-foreground max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm lg:max-w-[36rem]">
					<div className={cn(isStreamingAnswer && "shimmer-text")}>
						<ChatMarkdown markdown={chatTurn.answer} />
					</div>
				</div>
				{!isWaitingForAnswer && !isStreamingAnswer && chatTurn.answer !== "" && (
					<AnswerFooter answer={chatTurn.answer} answerTime={chatTurn.at} now={now} />
				)}
			</div>
		</ChatAuthor>
	)
}

// the footer shows the copy button and time ago to the left
function AnswerFooter({ answer, answerTime, now }: { answer: string; answerTime?: number; now: number }) {
	return (
		<div className="text-muted-foreground -ml-1 mt-1 flex items-center gap-2 text-xs">
			<CopyButton text={answer} />
			{answerTime !== undefined && <span>{toTimeAgoLabel(answerTime, now)}</span>}
		</div>
	)
}

// the copy button shows a check once the text writes to the clipboard
export function CopyButton({ text }: { text: string }) {
	const [isCopied, setIsCopied] = useState(false)
	// controlled so the copied confirmation survives the click. a tooltip closes when its trigger is clicked
	const [isTooltipOpen, setIsTooltipOpen] = useState(false)

	// write the clipboard and flash the check
	async function handleCopy(): Promise<void> {
		try {
			await navigator.clipboard.writeText(text)
			setIsCopied(true)
			setTimeout(() => setIsCopied(false), 1500)
		} catch (error) {
			console.error("copy failed", error)
		}
	}

	return (
		<Tooltip open={isCopied || isTooltipOpen} onOpenChange={setIsTooltipOpen}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={isCopied ? "Copied" : "Copy message"}
					onClick={handleCopy}
					className="hover:text-foreground grid size-6 place-items-center rounded-md"
				>
					{isCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
				</button>
			</TooltipTrigger>
			<TooltipContent>{isCopied ? "Copied" : "Copy message"}</TooltipContent>
		</Tooltip>
	)
}

// one "Carl is ___" shimmer line shown while waiting for the response
export function ThinkingLine() {
	const [thinkingLine] = useState(randomThinkingLine)
	return <span className="shimmer-text">{`Carl is ${thinkingLine}…`}</span>
}

// carl's bubble while he thinks: the avatar, the mug, and the shimmer
export function CarlThinkingBubble() {
	return (
		<ChatAuthor authorUserId={null} authorUsername="Carl">
			<div className="flex flex-col items-start">
				<div className="bg-bubble text-foreground max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm lg:max-w-[36rem]">
					<span className="text-muted-foreground flex items-center gap-2">
						<CoffeeMug className="size-4" />
						<ThinkingLine />
					</span>
				</div>
			</div>
		</ChatAuthor>
	)
}

// what a rejected chat turn shows with a possible call to action
function ChatRejectionNotice({ rejection, onRetry }: { rejection: ChatRejection; onRetry?: () => void }) {
	// a stream that broke mid-reply invites another try, and the invitation re-asks the question
	if (rejection === "failed") {
		return (
			<p className="text-muted-foreground text-sm">
				{"Carl lost his train of thought. "}
				{onRetry ? (
					<button type="button" onClick={onRetry} className="text-link hover:underline">
						Try again?
					</button>
				) : (
					"Try again?"
				)}
			</p>
		)
	}

	// an exhausted budget shows a call-to-action to upgrade at the plans page. anything forbidden says so.
	if (rejection === "budget") {
		return <ChatBudgetNotice />
	}
	return <p className="text-muted-foreground text-sm">{"Carl can't talk about that."}</p>
}

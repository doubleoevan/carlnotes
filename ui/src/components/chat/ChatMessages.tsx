import { CHAT_HISTORY_TURNS, toUncompactedChatTurnStart } from "@shared/contracts"
import { ArrowDown, Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { ChatBudgetNotice } from "@/components/chat/ChatBudgetNotice"
import { ChatMarkdown } from "@/components/chat/ChatMarkdown"
import { randomThinkingLine } from "@/components/chat/thinkingLines"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import type { ChatRefusal } from "@/lib/chatClient"
import { cn } from "@/lib/utils"

// one chat turn in the message list. the answer fills in as the reply streams and refusal replaces it on a refused chat turn.
// it is absent while the reply is still arriving
export type ChatTurn = { question: string; answer: string; refusal: ChatRefusal | null; at?: number }

// how often the "minutes ago" labels re-read the clock (one minute)
const CLOCK_TICK_MS = 60_000

// how far the from bottom that still counts as reading the newest chat turn
const AT_BOTTOM_SLACK_PX = 48

// virtualize the chat messages window after this many turns
const VIRTUALIZE_FROM_CHAT_TURNS = 30

/**
 * The scrollable message list. It starts short and grows with the conversation, then it scrolls inside its own box.
 */
export function ChatMessages({
	chatTurns,
	isStreaming,
	topicName,
	isBudgetExhausted,
}: {
	chatTurns: ChatTurn[]
	isStreaming: boolean
	topicName: string
	// a conversation with no turns left in the budget does not show an input to add more
	isBudgetExhausted?: boolean
}) {
	// one scroll handle per list. the plain list scrolls to an end marker, and the virtualized one scrolls itself,
	// because only the virtualizer knows where an index it has not rendered yet would land
	const bottomRef = useRef<HTMLDivElement>(null)
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	// whether the message list has already landed on the newest chat turn
	const hasLandedRef = useRef(false)

	// whether the reader is at the newest chat turn or has scrolled up from it.
	// it decides both whether a new chunk scrolls the view, and whether the jump-to-latest button is offered
	const [isAtBottom, setIsAtBottom] = useState(true)

	// a clock to share for every footer's relative time, ticking once a minute
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
		return () => clearInterval(interval)
	}, [])

	// keep the newest chat turn in view while the reply streams, but only for a reader who is already at the bottom,
	// so a streaming reply never pulls someone away from what they scrolled back to read.
	// streaming jumps instead of scrolls, because every chunk restarts a smooth scroll from behind
	const newestAnswerLength = chatTurns.at(-1)?.answer.length ?? 0
	// biome-ignore lint/correctness/useExhaustiveDependencies: the counts are scroll triggers, not values the effect reads
	useEffect(() => {
		if (!isAtBottom) {
			return
		}
		// the initial scroll to the bottom is instant
		const isFirstLanding = !hasLandedRef.current
		hasLandedRef.current = true
		bottomRef.current?.scrollIntoView({
			behavior: isFirstLanding || isStreaming ? "auto" : "smooth",
			block: "end",
		})
	}, [chatTurns.length, newestAnswerLength, isStreaming, isAtBottom])

	// jump back to the newest chat turn, instantly instead of smooth scroll, when the user clicks the scroll to latest button
	function scrollToLatest(): void {
		virtuosoRef.current?.scrollToIndex({ index: chatTurns.length - 1, align: "end" })
		bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
	}

	// the message list reports whether it is at the bottom on user scroll
	function handleScroll(event: React.UIEvent<HTMLDivElement>): void {
		const { scrollHeight, scrollTop, clientHeight } = event.currentTarget
		setIsAtBottom(scrollHeight - scrollTop - clientHeight <= AT_BOTTOM_SLACK_PX)
	}

	// what we send to the model without compacting
	const historyStart = Math.max(0, chatTurns.length - CHAT_HISTORY_TURNS)
	const uncompactedChatTurnStart = historyStart + toUncompactedChatTurnStart(chatTurns.slice(-CHAT_HISTORY_TURNS))

	// past a long conversation window, the message list virtualizes
	if (chatTurns.length >= VIRTUALIZE_FROM_CHAT_TURNS) {
		return (
			<div className="relative h-[55dvh] min-h-0 grow">
				<Virtuoso
					ref={virtuosoRef}
					data={chatTurns}
					initialTopMostItemIndex={chatTurns.length - 1}
					followOutput="auto"
					atBottomStateChange={setIsAtBottom}
					atBottomThreshold={AT_BOTTOM_SLACK_PX}
					itemContent={(index, chatTurn) => (
						<div className="px-3 py-2">
							<ChatTurnBlock
								chatTurn={chatTurn}
								index={index}
								uncompactedChatTurnStart={uncompactedChatTurnStart}
								isLast={index === chatTurns.length - 1}
								isStreaming={isStreaming}
								now={now}
							/>
						</div>
					)}
				/>
				<ScrollToLatestButton isShown={!isAtBottom} onClick={scrollToLatest} />
			</div>
		)
	}

	return (
		<div className="relative flex min-h-24 flex-1 flex-col">
			<div onScroll={handleScroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
				{chatTurns.length === 0 && !isBudgetExhausted && <ChatInputPlaceholder topicName={topicName} />}
				{chatTurns.map((chatTurn, index) => (
					<ChatTurnBlock
						// biome-ignore lint/suspicious/noArrayIndexKey: chat turns are append-only and never reordered
						key={index}
						chatTurn={chatTurn}
						index={index}
						uncompactedChatTurnStart={uncompactedChatTurnStart}
						isLast={index === chatTurns.length - 1}
						isStreaming={isStreaming}
						now={now}
					/>
				))}
				<div ref={bottomRef} />
			</div>
			<ScrollToLatestButton isShown={!isAtBottom} onClick={scrollToLatest} />
		</div>
	)
}

// the jump back down to the newest chat turn button, floating over the end of the message list.
// it only shows only once the reader has scrolled away from the bottom
function ScrollToLatestButton({ isShown, onClick }: { isShown: boolean; onClick: () => void }) {
	if (!isShown) {
		return null
	}
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label="Jump to the latest message"
			className="bg-card text-foreground shadow-raise absolute bottom-3 left-1/2 z-10 grid size-8 -translate-x-1/2 place-items-center rounded-full border transition-transform hover:scale-105"
		>
			<ArrowDown className="size-4" />
		</button>
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
}: {
	chatTurn: ChatTurn
	index: number
	uncompactedChatTurnStart: number
	isLast: boolean
	isStreaming: boolean
	now: number
}) {
	return (
		<div className="space-y-3">
			{/* the compaction line sits above the uncompacted messages that are sent on every turn */}
			{uncompactedChatTurnStart > 0 && index === uncompactedChatTurnStart && <CompactionNotice />}
			<QuestionBubble chatTurn={chatTurn} now={now} />
			<AnswerBubble chatTurn={chatTurn} isLast={isLast} isStreaming={isStreaming} now={now} />
		</div>
	)
}

/**
 * Formats the label for how long ago a chat turn settled, from "just now" through minutes, hours, and days.
 */
export function toRelativeTimeLabel(at: number, now: number): string {
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

// the chat input placeholder line
function ChatInputPlaceholder({ topicName }: { topicName: string }) {
	return <p className="text-muted-foreground py-2 text-sm">{`Ask me anything about ${topicName || "this topic"}.`}</p>
}

// the reader's own question to the right
function QuestionBubble({ chatTurn, now }: { chatTurn: ChatTurn; now: number }) {
	return (
		<div className="group flex flex-col items-end">
			<p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm whitespace-pre-wrap">
				{chatTurn.question}
			</p>
			{/* the footer shows the time ago and copy button to the right on hover */}
			<div className="text-muted-foreground -mr-1 mt-1 flex items-center gap-2 text-xs transition-opacity can-hover:opacity-0 can-hover:focus-within:opacity-100 can-hover:group-hover:opacity-100">
				{chatTurn.at !== undefined && <span>{toRelativeTimeLabel(chatTurn.at, now)}</span>}
				<CopyButton text={chatTurn.question} />
			</div>
		</div>
	)
}

// the llm reply on the left.
// it shows the CoffeeMug and thinking message shimmer before the response starts streaming
function AnswerBubble({
	chatTurn,
	isLast,
	isStreaming,
	now,
}: {
	chatTurn: ChatTurn
	isLast: boolean
	isStreaming: boolean
	now: number
}) {
	// the two live states, waiting while showing the thinking message and streaming the response
	const isAwaitingFirstToken = isLast && isStreaming && chatTurn.answer === ""
	const isStreamingThisAnswer = isLast && isStreaming && chatTurn.answer !== ""

	// a refused chat turn shows the failure or a call to action instead of an empty bubble
	if (chatTurn.refusal) {
		return <ChatRefusalNotice refusal={chatTurn.refusal} />
	}

	return (
		<div className="group flex flex-col items-start">
			<div className="bg-muted text-foreground max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm">
				{isAwaitingFirstToken ? (
					<span className="text-muted-foreground flex items-center gap-2">
						<CoffeeMug className="size-4" />
						<ThinkingLine />
					</span>
				) : (
					<div className={cn(isStreamingThisAnswer && "shimmer-text")}>
						<ChatMarkdown markdown={chatTurn.answer} />
					</div>
				)}
			</div>
			{!isAwaitingFirstToken && !isStreamingThisAnswer && chatTurn.answer !== "" && (
				<AnswerFooter answer={chatTurn.answer} at={chatTurn.at} now={now} />
			)}
		</div>
	)
}

// the footer shows the copy button and time ago to the left on hover
function AnswerFooter({ answer, at, now }: { answer: string; at?: number; now: number }) {
	return (
		<div className="text-muted-foreground -ml-1 mt-1 flex items-center gap-2 text-xs transition-opacity can-hover:opacity-0 can-hover:focus-within:opacity-100 can-hover:group-hover:opacity-100">
			<CopyButton text={answer} />
			{at !== undefined && <span>{toRelativeTimeLabel(at, now)}</span>}
		</div>
	)
}

// the copy button showing a check once the text writes to the clipboard.
// it copies the raw Markdown, so a paste keeps the formatting the reader saw
function CopyButton({ text }: { text: string }) {
	const [isCopied, setIsCopied] = useState(false)

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
		<Tooltip>
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
function ThinkingLine() {
	const [thinkingLine] = useState(randomThinkingLine)
	return <span className="shimmer-text">{`Carl is ${thinkingLine}…`}</span>
}

// what a refused chat turn shows with a possible call to action
function ChatRefusalNotice({ refusal }: { refusal: ChatRefusal }) {
	// a stream that broke mid-reply invites another try
	if (refusal === "failed") {
		return <p className="text-muted-foreground text-sm">{"Carl lost his train of thought. Try again?"}</p>
	}

	// an exhausted budget points at the pricing page, and anything else forbidden simply says no
	if (refusal === "budget") {
		return <ChatBudgetNotice />
	}
	return <p className="text-muted-foreground text-sm">{"Carl can't talk about this topic."}</p>
}

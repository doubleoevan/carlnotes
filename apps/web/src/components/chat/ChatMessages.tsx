// the private chat's scrollable chat message list, virtualized past a long conversation
import { CHAT_HISTORY_TURNS, toUncompactedChatTurnStart } from "@carlnotes/contracts/chat"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { useNow } from "@carlnotes/core/hooks/useNow"
import { cn } from "@carlnotes/nightshift/classNames"
import { useEffect, useRef } from "react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import { type ChatMessageAuthor, ChatTurnBlock } from "./ChatTurnBlock"
import type { ChatTurn } from "./chatTurns"
import { ScrollDownButton, useAtBottom } from "./ScrollDownButton.tsx"

// virtualize the chat messages window after this many chat turns
const VIRTUALIZE_FROM_CHAT_TURNS = 30

/**
 * The scrollable chat message list. It starts short and grows with the conversation, then it scrolls inside its own box.
 */
export function ChatMessages({
	chatTurns,
	isStreaming,
	chatName,
	isBudgetExhausted,
	author,
	voiceChatPage,
	onRetry,
	isEnlarged,
	openingLine,
}: {
	chatTurns: ChatTurn[]
	isStreaming: boolean
	// whether the panel expands to fill the screen
	isEnlarged: boolean
	chatName: string
	// a conversation with no chat turns left in the budget does not show an input to add more
	isBudgetExhausted?: boolean
	// the current user
	author: ChatMessageAuthor
	// the page each answer's play button names, null while voice is off
	voiceChatPage: VoiceChatPage | null
	// re-asks a failed chat turn's question on the failure notice
	onRetry?: (question: string) => void
	// what an empty conversation opens with, in place of the hot take line
	openingLine?: string
}) {
	// one scroll handle per list
	const bottomRef = useRef<HTMLDivElement>(null)
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	// use a ref to check whether the chat message list is at the bottom
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

	// past a long conversation window, the chat message list virtualizes
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
								voiceChatPage={voiceChatPage}
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
		<div className="relative flex min-h-0 flex-1 flex-col">
			<div
				onScroll={handleScroll}
				className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3 wrap-anywhere"
			>
				{chatTurns.length === 0 && !isBudgetExhausted && (
					<ChatInputPlaceholder chatName={chatName} openingLine={openingLine} />
				)}
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
						voiceChatPage={voiceChatPage}
						onRetry={onRetry}
					/>
				))}
				<div ref={bottomRef} />
			</div>
			<ScrollDownButton isScrollDownShown={!isAtBottom} onScrollDown={scrollToLatest} />
		</div>
	)
}

// the placeholder line for an empty conversation, naming the topic
function ChatInputPlaceholder({ chatName, openingLine }: { chatName: string; openingLine?: string }) {
	return (
		<p className="text-muted-foreground py-2 text-sm">
			{openingLine ?? `Ask me for a hot take on ${chatName || "this chat"}.`}
		</p>
	)
}

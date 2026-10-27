import type { ChatRejection } from "@carlnotes/client/chatClient"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import type { ComponentType, ReactNode } from "react"
import type { ChatTurn } from "../lib/chatTurns"

export type ChatMessageAuthor = { userId: string | null; username: string; avatarVersion: string | null }
export type ChatTurnBlockProps = {
	chatTurn: ChatTurn
	index: number
	uncompactedChatTurnStart: number
	isLast: boolean
	isStreaming: boolean
	now: number
	author: ChatMessageAuthor
	voiceChatPage: VoiceChatPage | null
	onRetry?: (question: string) => void
}
export type ChatTurnElements = {
	Frame: ComponentType<{ children: ReactNode }>
	Compaction: ComponentType
	Question: ComponentType<Pick<ChatTurnBlockProps, "chatTurn" | "now" | "author">>
	Answer: ComponentType<Pick<ChatTurnBlockProps, "chatTurn" | "now" | "voiceChatPage"> & { isStreamingAnswer: boolean }>
	Thinking: ComponentType
	Rejection: ComponentType<{ rejection: ChatRejection; onRetry?: () => void }>
}

/**
 * Composes a private turn with shared compaction, waiting, rejection, and answer rules.
 */
export function ChatTurnBlock({
	chatTurn,
	index,
	uncompactedChatTurnStart,
	isLast,
	isStreaming,
	now,
	author,
	voiceChatPage,
	onRetry,
	elements: { Frame, Compaction, Question, Answer, Thinking, Rejection },
}: ChatTurnBlockProps & { elements: ChatTurnElements }) {
	const isWaiting = isLast && isStreaming && chatTurn.answer === "" && !chatTurn.rejection
	return (
		<Frame>
			{/* history boundary and question */}
			{uncompactedChatTurnStart > 0 && index === uncompactedChatTurnStart && <Compaction />}
			<Question chatTurn={chatTurn} now={now} author={author} />
			{/* answer state */}
			{isWaiting ? (
				<Thinking />
			) : chatTurn.rejection ? (
				<Rejection rejection={chatTurn.rejection} onRetry={onRetry && (() => onRetry(chatTurn.question))} />
			) : (
				<Answer
					chatTurn={chatTurn}
					now={now}
					voiceChatPage={voiceChatPage}
					isStreamingAnswer={isLast && isStreaming && chatTurn.answer !== ""}
				/>
			)}
		</Frame>
	)
}

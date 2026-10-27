import type { ChatRejection } from "@carlnotes/client/chatClient"
import type { ComponentType, ReactNode } from "react"
import { CHAT_REJECTION_COPY } from "../lib/chatRejectionCopy"

export type ChatRejectionElements = {
	Text: ComponentType<{ children: ReactNode }>
	Retry: ComponentType<{ onRetry: () => void }>
	Budget: ComponentType
}

/**
 * Keeps rejection words and retry availability shared while the platform supplies its permitted actions.
 */
export function ChatRejectionNotice({
	rejection,
	onRetry,
	elements: { Text, Retry, Budget },
}: {
	rejection: ChatRejection
	onRetry?: () => void
	elements: ChatRejectionElements
}) {
	if (rejection === "budget") {
		return <Budget />
	}
	if (rejection === "failed") {
		return (
			<Text>
				{`${CHAT_REJECTION_COPY.failed} `}
				{onRetry ? <Retry onRetry={onRetry} /> : "Try again?"}
			</Text>
		)
	}
	return <Text>{CHAT_REJECTION_COPY[rejection]}</Text>
}

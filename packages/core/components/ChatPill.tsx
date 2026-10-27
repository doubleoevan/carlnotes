import { CHAT_NAME } from "@carlnotes/contracts/chat"
import type { ComponentType, ReactNode } from "react"

export type ChatPillElements = {
	Button: ComponentType<{ children: ReactNode; onOpenChat: () => void; label: string }>
	Label: ComponentType<{ children: ReactNode }>
	CoffeeCup: ComponentType
}

/**
 * Composes the shared chat launcher with each platform's button and cup.
 */
export function ChatPill({
	onOpenChat,
	badge,
	elements: { Button, Label, CoffeeCup },
}: {
	onOpenChat: () => void
	badge?: ReactNode
	elements: ChatPillElements
}) {
	return (
		<Button onOpenChat={onOpenChat} label={CHAT_NAME}>
			<CoffeeCup />
			<Label>{CHAT_NAME}</Label>
			{badge}
		</Button>
	)
}

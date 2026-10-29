import { CHAT_NAME, type ChatMention } from "@carlnotes/contracts/chat"
import type { ComponentType, ReactNode } from "react"
import { toUpdateLabel } from "../lib/updateCounts"

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
	chatMentions,
	badge,
	elements: { Button, Label, CoffeeCup },
}: {
	onOpenChat: () => void
	// the unread chat mentions, which the pill's own name reads after its name, and each platform's badge for them
	chatMentions: ChatMention[]
	badge?: ReactNode
	elements: ChatPillElements
}) {
	const badgeLabel = toUpdateLabel({ chatMentions, noteBadges: [], invites: [] })
	return (
		<Button onOpenChat={onOpenChat} label={badgeLabel ? `${CHAT_NAME}, ${badgeLabel}` : CHAT_NAME}>
			<CoffeeCup />
			<Label>{CHAT_NAME}</Label>
			{badge}
		</Button>
	)
}

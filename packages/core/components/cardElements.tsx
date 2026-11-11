// the elements a topic card, a podcast episode card, and a Topic Post card share: the card, the image at the page
// size, a text row, and the reaction count at the right of a card's last row.
// the card takes the page's path, so a phone makes the whole card the link and the browser stretches the heading's link
// over the card
import type { TopicImageUrls } from "@carlnotes/contracts/topicImages"
import type { ComponentType, ReactNode } from "react"

export type CardElements = {
	Card: ComponentType<{ path: string; label: string; className: string; onOpen?: () => void; children: ReactNode }>
	Image: ComponentType<{ image: TopicImageUrls | null; name: string }>
	Row: ComponentType<{ className: string; children: ReactNode }>
	Reactions: ComponentType<{ count: number }>
}

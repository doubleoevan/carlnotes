// the browser elements a topic card and a podcast episode card share: the card as the box that the heading's link
// stretches over, the topic image at the page size, and a text row
import type { CardElements } from "@carlnotes/core/components/cardElements"
import { cn } from "@carlnotes/nightshift/classNames"
import { TopicImage } from "@/components/primitives/topic-image"
import { CARD_LINK_BOX_CLASS } from "@/lib/styleClasses"

export const CARD_ELEMENTS: CardElements = {
	Card: ({ className, children }) => <div className={cn(className, CARD_LINK_BOX_CLASS)}>{children}</div>,
	Image: ({ image, name }) => <TopicImage image={image} size="page" name={name} className="rounded-b-none" />,
	Row: ({ className, children }) => <div className={cn("flex flex-col", className)}>{children}</div>,
}

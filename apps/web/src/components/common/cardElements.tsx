// the browser elements a topic card, a podcast episode card, and a Topic Post card share: the card as the box that
// the heading's link stretches over, the topic image at the page size, a text row, and the reaction count
import type { CardElements } from "@carlnotes/core/components/cardElements"
import { cn } from "@carlnotes/nightshift/classNames"
import { Heart } from "lucide-react"
import { TopicImage } from "@/components/primitives/topic-image"
import { CARD_LINK_BOX_CLASS, PENDING_IMAGE_CLASS } from "@/lib/styleClasses"

export const CARD_ELEMENTS: CardElements = {
	Card: ({ className, children }) => <div className={cn(className, CARD_LINK_BOX_CLASS)}>{children}</div>,
	Image: ({ image, name, isPending }) => (
		<TopicImage
			image={image}
			size="page"
			name={name}
			className={cn("rounded-b-none", isPending && PENDING_IMAGE_CLASS)}
		/>
	),
	Row: ({ className, children }) => <div className={cn("flex flex-col", className)}>{children}</div>,
	Reactions: ({ count }) => (
		<span className="text-muted-foreground ml-auto inline-flex shrink-0 items-center gap-1 text-xs">
			<Heart aria-hidden className="size-3 fill-current" />
			{count}
		</span>
	),
}

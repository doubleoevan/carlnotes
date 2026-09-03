import { ArrowDown } from "lucide-react"
import type * as React from "react"
import { useState } from "react"

// how close to the end still counts as the bottom, so the ScrollDownButton doesn't get hidden
const AT_BOTTOM_RANGE_PX = 48

/**
 * Whether the user is at the end of a chat message list, shared by the private chat and the chat room.
 * The plain list reports through onScroll and the virtualized one through atBottomStateChange.
 * Both lists answer the same question. It decides whether a new chat message scrolls the view and whether the ScrollDownButton shows.
 */
export function useAtBottom() {
	const [isAtBottom, setIsAtBottom] = useState(true)

	// the plain list measures its own scroll box
	const handleScroll = (event: React.UIEvent<HTMLDivElement>): void => {
		const { scrollHeight, scrollTop, clientHeight } = event.currentTarget
		setIsAtBottom(scrollHeight - scrollTop - clientHeight <= AT_BOTTOM_RANGE_PX)
	}
	return { isAtBottom, setIsAtBottom, handleScroll, atBottomThreshold: AT_BOTTOM_RANGE_PX }
}

/**
 * The jump back down to the newest chat message button, shown over the end of a chat message list.
 * It only shows once the user has scrolled away from the bottom.
 */
export function ScrollDownButton({
	isScrollDownShown,
	onScrollDown,
}: {
	isScrollDownShown: boolean
	onScrollDown: () => void
}) {
	if (!isScrollDownShown) {
		return null
	}
	return (
		<button
			type="button"
			onClick={onScrollDown}
			aria-label="Jump to the latest message"
			className="bg-card text-foreground shadow-lift absolute bottom-3 left-1/2 z-10 grid size-8 -translate-x-1/2 place-items-center rounded-full border transition-transform hover:scale-105"
		>
			<ArrowDown className="size-4" />
		</button>
	)
}

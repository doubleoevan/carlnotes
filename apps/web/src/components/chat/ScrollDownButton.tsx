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
 * Adapts the shared latest-message action to the browser's button.
 */
export function ScrollDownButton(props: Omit<React.ComponentProps<typeof SharedScrollDownButton>, "elements">) {
	return <SharedScrollDownButton {...props} elements={SCROLL_DOWN_BUTTON_ELEMENTS} />
}

// retain pointer hover feedback beside the shared position and appearance
const SCROLL_DOWN_BUTTON_ELEMENTS: ScrollDownButtonElements = {
	Button: ({ children, onPress, label, className }) => (
		<button
			type="button"
			onClick={onPress}
			aria-label={label}
			className={`${className} grid size-8 place-items-center transition-transform hover:scale-105`}
		>
			{children}
		</button>
	),
	ArrowDown: () => <ArrowDown className="size-4" />,
}

import {
	type ScrollDownButtonElements,
	ScrollDownButton as SharedScrollDownButton,
} from "@carlnotes/core/components/ScrollDownButton"

import { useEffect, useState } from "react"
import { isTouchScreen } from "@/lib/utils"

/**
 * The part of the screen a phone's keyboard leaves visible, from its top edge down.
 */
export type KeyboardViewport = { top: number; height: number }

// the visual viewport when a keyboard has made it shorter than the page's own. a browser that shrinks the page instead gets null
function toKeyboardViewport(): KeyboardViewport | null {
	const visualViewport = window.visualViewport
	if (!visualViewport || !isTouchScreen() || visualViewport.height >= window.innerHeight - 1) {
		return null
	}
	return { top: visualViewport.offsetTop, height: visualViewport.height }
}

/**
 * Follows a phone's on-screen keyboard: the area it leaves visible, or null while the whole page is visible.
 */
export function useKeyboardViewport(): KeyboardViewport | null {
	const [keyboardViewport, setKeyboardViewport] = useState<KeyboardViewport | null>(null)
	useEffect(() => {
		const visualViewport = window.visualViewport
		if (!visualViewport) {
			return
		}
		// the keyboard opening, closing, and the page scrolling under it all move the visible area
		const updateKeyboardViewport = (): void => setKeyboardViewport(toKeyboardViewport())
		updateKeyboardViewport()
		visualViewport.addEventListener("resize", updateKeyboardViewport)
		visualViewport.addEventListener("scroll", updateKeyboardViewport)
		// stop following once the panel is gone
		return () => {
			visualViewport.removeEventListener("resize", updateKeyboardViewport)
			visualViewport.removeEventListener("scroll", updateKeyboardViewport)
		}
	}, [])
	return keyboardViewport
}

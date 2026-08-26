import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"

/**
 * Reveals an element once it scrolls into view.
 * returns a ref and whether its element has scrolled into view. it stays true once seen
 */
export function useIsVisible<T extends HTMLElement>(): { ref: RefObject<T | null>; isVisible: boolean } {
	const ref = useRef<T>(null)
	const [isVisible, setIsVisible] = useState(false)
	useEffect(() => {
		const element = ref.current
		// nothing to watch, or already revealed
		if (!element || isVisible) {
			return
		}

		// without the observer there is nothing to reveal on
		if (typeof IntersectionObserver === "undefined") {
			setIsVisible(true)
			return
		}

		// reveal once when the element is a bit inside the viewport by setting isVisible to true
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setIsVisible(true)
				}
			},
			// the negative bottom margin raises the trigger line to 10% of the viewport height above the bottom
			{ rootMargin: "0px 0px -10% 0px" },
		)

		// start watching and disconnect on cleanup
		observer.observe(element)
		return () => observer.disconnect()
	}, [isVisible])
	return { ref, isVisible }
}

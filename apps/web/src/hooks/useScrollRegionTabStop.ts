import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"

/**
 * Gives a scrolling box a tab stop while its content overflows it down or across, and returns the ref and tabIndex for
 * that box.
 */
export function useScrollRegionTabStop<T extends HTMLElement>(): { ref: RefObject<T | null>; tabIndex: 0 | undefined } {
	const ref = useRef<T>(null)
	const [isScrollable, setIsScrollable] = useState(false)
	useEffect(() => {
		// the observer attaches once on mount, so the box mounts with the component that calls this hook
		const element = ref.current
		// nothing to watch, or no observer to watch with
		if (!element || typeof ResizeObserver === "undefined") {
			return
		}

		// the box or its content changing size can start or stop the scrolling
		// ponytail: watches the children present at mount. a child added later counts once a watched size changes
		const observer = new ResizeObserver(() =>
			setIsScrollable(element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth),
		)
		observer.observe(element)
		for (const child of Array.from(element.children)) {
			observer.observe(child)
		}

		// stop watching on cleanup
		return () => observer.disconnect()
	}, [])
	return { ref, tabIndex: isScrollable ? 0 : undefined }
}

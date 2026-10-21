// the class that shows an element as its page reveals it: at once if the server rendered it,
// or once it scrolls into view if the browser rendered it
import type { RefObject } from "react"
import { useState } from "react"
import { useIsHydrating } from "./useBrowserValue"
import { useIsVisible } from "./useIsVisible"

// whether an element the server rendered plays the hydrate animation as the page loads, or is simply shown
type UseRevealClassNameOptions = { isAnimatedOnServer: boolean }

/**
 * Returns a ref and the class that shows its element. An element the server rendered is shown before any script runs,
 * playing the hydrate animation if asked, so no visitor, crawler, or browser without scripts finds it hidden.
 * An element rendered in the browser stays hidden until it scrolls into view, then plays the animation.
 */
export function useRevealClassName<T extends HTMLElement>({
	isAnimatedOnServer,
}: UseRevealClassNameOptions): {
	ref: RefObject<T | null>
	revealClassName: string | undefined
} {
	// the server's HTML and the render that hydrates it agree, and the choice stays for the element's life
	const { ref, isVisible } = useIsVisible<T>()
	const isHydrating = useIsHydrating()
	const [isRenderedOnServer] = useState(isHydrating)
	if (isRenderedOnServer) {
		return { ref, revealClassName: isAnimatedOnServer ? "animate-hydrate" : undefined }
	}
	return { ref, revealClassName: isVisible ? "animate-hydrate" : "opacity-0" }
}

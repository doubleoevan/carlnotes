// a scroll view that opens at the view a link names, a section or a comment's row, with the end of each scroll that
// a row waiting to be seen measures itself at
import { toEventListeners } from "@carlnotes/core/stores/storeListeners"
import { type ComponentRef, type RefObject, useMemo, useRef } from "react"
import type { ScrollView } from "react-native"
import type { SectionTargetRef } from "@/components/layout/SectionAnchor"

// the space left above the view a scroll view opens at
const SCROLL_TARGET_GAP = 12

// the end of a scroll in any of the app's scroll views
const scrollEndListeners = toEventListeners<void>()

/**
 * Subscribes a listener to the end of each scroll, and returns the call that removes it.
 */
export function subscribeScrollEnd(listener: () => void): () => void {
	return scrollEndListeners.subscribe(listener)
}

// a view's top and height in the window, and the window's height
type IsHalfInWindowOptions = { y: number; height: number; windowHeight: number }

/**
 * Returns whether at least half of a view's height is inside the window, the share the web's row observer waits for.
 */
export function isHalfInWindow({ y, height, windowHeight }: IsHalfInWindowOptions): boolean {
	const visibleHeight = Math.min(y + height, windowHeight) - Math.max(y, 0)
	return height > 0 && visibleHeight >= height / 2
}

// the ref that the linked view fills in, and the handlers that the scroll view takes
type SectionTargetScroll = {
	sectionTargetRef: SectionTargetRef
	// the content's size changes, the user's drag starts, and a scroll ends
	scrollHandlers: {
		onContentSizeChange: () => void
		onScrollBeginDrag: () => void
		onScrollEndDrag: () => void
		onMomentumScrollEnd: () => void
	}
}

/**
 * Keeps a scroll view at the view a link opened it at as content above that view loads, until the user scrolls, and
 * announces the end of each scroll.
 */
export function useSectionTargetScroll(
	scrollViewRef: RefObject<ComponentRef<typeof ScrollView> | null>,
): SectionTargetScroll {
	const sectionTargetRef: SectionTargetRef = useRef(null)
	const hasUserScrolledRef = useRef(false)

	// the same handlers on every render, so a scroll view never takes new ones
	const scrollHandlers = useMemo(
		() => ({
			// scroll to the linked view each time the content's size changes, until the user scrolls
			onContentSizeChange: (): void => {
				const contentView = scrollViewRef.current?.getInnerViewRef()
				if (!sectionTargetRef.current || !contentView || hasUserScrolledRef.current) {
					return
				}

				// measure the linked view inside the content, and scroll to it with no animation
				sectionTargetRef.current.measureLayout(contentView, (_x, y) => {
					scrollViewRef.current?.scrollTo({ y: y - SCROLL_TARGET_GAP, animated: false })
				})
			},
			// a drag by the user ends the hold on the linked view
			onScrollBeginDrag: (): void => {
				hasUserScrolledRef.current = true
			},
			// a drag's end and a fling's end each end a scroll
			onScrollEndDrag: (): void => scrollEndListeners.announce(),
			onMomentumScrollEnd: (): void => scrollEndListeners.announce(),
		}),
		[scrollViewRef],
	)
	return { sectionTargetRef, scrollHandlers }
}

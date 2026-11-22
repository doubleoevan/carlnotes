// the card glow while a finger is on a card, a topic image link, a film poster, or a header avatar. a tap lifts the
// finger in a few frames, so the glow holds for a minimum time instead of flashing
import { useEffect, useRef, useState } from "react"

// the shortest time the glow shows, from the finger's touch
const CARD_GLOW_HOLD_MS = 300

// the glow's class while it shows, whose shadow each theme sets in uniwind.css
const CARD_GLOW_CLASS = "shadow-card-glow"

// the glowing key while no glow shows
const NO_GLOWING_KEY = Symbol("no glowing key")

/**
 * The glow's class for the pressable, and the press handlers that show it on touch and hide it once the finger lifts
 * and the hold has passed.
 */
export type CardGlow = { className: string; onPressIn: () => void; onPressOut: () => void }

/**
 * Returns the card glow's class and the press handlers that show and hide it. The glow belongs to the key it started
 * on, so a list row that a recycled view reuses for another item shows no glow.
 */
export function useCardGlow(glowKey: string): CardGlow {
	// the key whose glow shows, the time of the touch, and the timer that hides the glow after the hold
	const [glowingKey, setGlowingKey] = useState<string | typeof NO_GLOWING_KEY>(NO_GLOWING_KEY)
	const pressedAtMsRef = useRef(0)
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	// a pending hide is cleared once the pressable is gone
	useEffect(() => () => clearTimeout(hideTimerRef.current), [])
	return {
		className: glowingKey === glowKey ? CARD_GLOW_CLASS : "",
		onPressIn: () => {
			clearTimeout(hideTimerRef.current)
			pressedAtMsRef.current = Date.now()
			setGlowingKey(glowKey)
		},
		onPressOut: () => {
			const remainingMs = CARD_GLOW_HOLD_MS - (Date.now() - pressedAtMsRef.current)
			hideTimerRef.current = setTimeout(() => setGlowingKey(NO_GLOWING_KEY), Math.max(0, remainingMs))
		},
	}
}

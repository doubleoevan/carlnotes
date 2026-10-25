// whether the system's reduce motion setting is on, followed as it changes
import { useEffect, useState } from "react"
import { AccessibilityInfo } from "react-native"

/**
 * Returns whether the system's reduce motion setting is on, and updates if the setting changes.
 */
export function useIsReduceMotionEnabled(): boolean {
	const [isReduceMotionEnabled, setIsReduceMotionEnabled] = useState(false)

	// read the setting, then follow its changes
	useEffect(() => {
		AccessibilityInfo.isReduceMotionEnabled().then(setIsReduceMotionEnabled)
		const reduceMotionListener = AccessibilityInfo.addEventListener("reduceMotionChanged", setIsReduceMotionEnabled)
		return () => reduceMotionListener.remove()
	}, [])
	return isReduceMotionEnabled
}

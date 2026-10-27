import { useEffect, useState } from "react"
import { Keyboard } from "react-native"

/**
 * Follows keyboard visibility for native floating controls and editor spacing.
 */
export function useIsKeyboardVisible(): boolean {
	// seed an already open keyboard and retire both event subscriptions together
	const [isVisible, setIsVisible] = useState(Keyboard.isVisible())
	useEffect(() => {
		const showSubscription = Keyboard.addListener("keyboardDidShow", () => setIsVisible(true))
		const hideSubscription = Keyboard.addListener("keyboardDidHide", () => setIsVisible(false))
		return () => {
			showSubscription.remove()
			hideSubscription.remove()
		}
	}, [])
	return isVisible
}

import { useFocusEffect } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { AppState } from "react-native"

/**
 * Tracks whether the screen is focused and the app is active.
 */
export function useIsScreenActive(): boolean {
	// track route focus
	const [isFocused, setIsFocused] = useState(false)
	useFocusEffect(
		useCallback(() => {
			setIsFocused(true)
			return () => setIsFocused(false)
		}, []),
	)
	// track app activity
	const [isForeground, setIsForeground] = useState(AppState.currentState === "active")
	useEffect(() => {
		const appStateSubscription = AppState.addEventListener("change", (appState) =>
			setIsForeground(appState === "active"),
		)
		return () => appStateSubscription.remove()
	}, [])
	return isFocused && isForeground
}

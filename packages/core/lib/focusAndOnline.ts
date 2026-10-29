// whether the app is in the foreground and online, through Query's browser and native adapters, and how a poll
// subscribes to a change in either
import { focusManager, onlineManager } from "@tanstack/react-query"

/**
 * Returns true while the app is focused and online.
 */
export function isFocusedAndOnline(): boolean {
	return focusManager.isFocused() && onlineManager.isOnline()
}

/**
 * Calls the listener on a focus or a connectivity change, and returns the call that stops listening.
 */
export function subscribeToFocusAndOnline(listener: () => void): () => void {
	const stopFocus = focusManager.subscribe(() => listener())
	const stopOnline = onlineManager.subscribe(() => listener())
	return () => {
		stopFocus()
		stopOnline()
	}
}
